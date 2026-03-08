"""
rag_adapter.py
==============
Bridges main.py's symptom-detection flow with the RAG-generated decision tree.

Priority order when looking up a symptom:
  1. generated_decision_tree.json  — RAG-generated, grows over time as new symptoms
                                      are encountered.
  2. decision_tree.json            — static fallback for the 3 pre-loaded symptoms
                                      (chest_pain / fever / headache).

Schema is IDENTICAL across both files:
  symptom_decision_tree.symptoms[].followup_questions
  — so main.py / the app need zero changes to how questions are served.

When a chief-complaint has NO keyword match in either tree:
  → run_rag_for_symptom() is called synchronously.
  → result is merged into generated_decision_tree.json for future cache hits.
  → returns (symptom_node, None) on success or (None, error_message) on failure.
"""

import json
import os
import re
import sys
from datetime import date
from typing import Optional, Tuple

# ── Paths ──────────────────────────────────────────────────────────────────────
_HERE              = os.path.dirname(os.path.abspath(__file__))
_DATA_DIR          = os.path.normpath(os.path.join(_HERE, "..", "data"))
_STATIC_TREE_PATH  = os.path.join(_DATA_DIR, "rag_model", "decision_tree.json")
_GEN_TREE_PATH     = os.path.join(_DATA_DIR, "rag_model", "generated_decision_tree.json")
_RAG_DIR           = os.path.join(_DATA_DIR, "rag_model")


# ── File helpers ───────────────────────────────────────────────────────────────

def _load_symptoms_from_file(path: str) -> list:
    """Return the symptoms array from a decision-tree JSON file, or [] on error."""
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data["symptom_decision_tree"]["symptoms"]
    except Exception as e:
        print(f"[RAG ADAPTER] Could not load {path}: {e}")
        return []


def load_merged_tree() -> dict:
    """
    Return a decision-tree dict whose symptoms list is the union of
    generated_decision_tree.json (first / priority) and decision_tree.json
    (static fallback).  Duplicates are removed — generated takes precedence.
    """
    generated = _load_symptoms_from_file(_GEN_TREE_PATH)
    static    = _load_symptoms_from_file(_STATIC_TREE_PATH)

    gen_ids = {s["symptom_id"] for s in generated}
    merged  = generated + [s for s in static if s["symptom_id"] not in gen_ids]

    print(f"[RAG ADAPTER] Merged tree: {len(generated)} RAG + "
          f"{len(static) - len([s for s in static if s['symptom_id'] in gen_ids])} "
          f"static = {len(merged)} total symptoms")

    return {"symptom_decision_tree": {"symptoms": merged}}


def _normalize(text: str) -> str:
    """Strip all non-alphanumeric chars and lowercase. Used for fuzzy matching."""
    return re.sub(r"[^a-z0-9]", "", text.lower())


def _merge_node_into_generated(node: dict) -> None:
    """Upsert a single symptom node into generated_decision_tree.json."""
    # Load existing file or start fresh
    if os.path.exists(_GEN_TREE_PATH):
        with open(_GEN_TREE_PATH, "r", encoding="utf-8") as f:
            existing = json.load(f)
    else:
        existing = {
            "symptom_decision_tree": {
                "meta": {
                    "version": "2.0",
                    "purpose": "Symptom-specific triage + deep-dive questionnaire",
                    "source": "MedlinePlus via Tavily RAG + Cerebras LLM",
                    "generated_date": str(date.today()),
                },
                "symptoms": [],
            }
        }

    symptoms   = existing["symptom_decision_tree"]["symptoms"]
    existing_ids = {s["symptom_id"] for s in symptoms}

    if node["symptom_id"] in existing_ids:
        # Overwrite existing entry
        existing["symptom_decision_tree"]["symptoms"] = [
            node if s["symptom_id"] == node["symptom_id"] else s
            for s in symptoms
        ]
        print(f"[RAG ADAPTER] Updated existing entry '{node['symptom_id']}' "
              f"in generated_decision_tree.json")
    else:
        symptoms.append(node)
        print(f"[RAG ADAPTER] Added new entry '{node['symptom_id']}' "
              f"to generated_decision_tree.json")

    existing["symptom_decision_tree"]["meta"]["generated_date"] = str(date.today())

    with open(_GEN_TREE_PATH, "w", encoding="utf-8") as f:
        json.dump(existing, f, indent=2, ensure_ascii=False)


# ── Main entry point ───────────────────────────────────────────────────────────

def run_rag_for_symptom(chief_complaint: str) -> Tuple[Optional[dict], Optional[str]]:
    """
    Run the RAG pipeline for a chief complaint that didn't match any keyword.

    Parameters
    ----------
    chief_complaint : str
        Raw text from q_current_ailment, e.g. "my stomach hurts badly"

    Returns
    -------
    (symptom_node, None)       — on success; node is merged into generated_decision_tree.json
    (None, error_message)      — on failure; error_message can be surfaced to the app
    """
    # Inject rag_model onto sys.path so we can import rag_pipeline.py
    if _RAG_DIR not in sys.path:
        sys.path.insert(0, _RAG_DIR)

    try:
        # ── Import RAG functions ──────────────────────────────────────────────
        from rag_pipeline import _extract_symptoms_with_llm, run_pipeline   # type: ignore

        # ── Step 1: Extract & normalise symptom name from free text ──────────
        print(f"[RAG] Extracting symptom from: '{chief_complaint}'")
        symptoms = _extract_symptoms_with_llm(chief_complaint)

        if not symptoms:
            return None, f"RAG could not extract a symptom from: '{chief_complaint}'"

        # Use the first extracted symptom (most prominent)
        symptom_name = symptoms[0].strip()
        print(f"[RAG] Primary symptom identified: '{symptom_name}'")

        # ── Step 2: Check cache — maybe it was already generated earlier ─────
        norm_target = _normalize(symptom_name)
        for existing_node in _load_symptoms_from_file(_GEN_TREE_PATH):
            if _normalize(existing_node["symptom_id"]) == norm_target:
                print(f"[RAG] Cache hit in generated_decision_tree.json "
                      f"— '{existing_node['symptom_id']}' already exists")
                return existing_node, None

        # ── Step 3: Run the full RAG pipeline ─────────────────────────────────
        print(f"[RAG] Cache miss — running full pipeline for '{symptom_name}' "
              f"(this may take ~30-90 seconds) …")
        result = run_pipeline([symptom_name])

        nodes = result.get("symptom_decision_tree", {}).get("symptoms", [])
        if not nodes:
            return None, f"RAG pipeline produced no output for: '{symptom_name}'"

        # Check for pipeline-level errors
        errors = result.get("symptom_decision_tree", {}).get("errors", [])
        if errors and not nodes:
            err_detail = errors[0].get("error", "unknown error")
            return None, f"RAG pipeline error for '{symptom_name}': {err_detail}"

        node = nodes[0]

        # Validate the node has followup_questions (required by main.py)
        if "followup_questions" not in node or not node["followup_questions"]:
            return None, (f"RAG generated a node for '{symptom_name}' "
                          f"but it has no followup_questions")

        # ── Step 4: Persist into generated_decision_tree.json ─────────────────
        _merge_node_into_generated(node)

        print(f"[RAG] ✓ Successfully generated & cached: '{node.get('label', symptom_name)}'")
        return node, None

    except ImportError as e:
        return None, (f"RAG pipeline dependencies not installed. "
                      f"Run: pip install openai tavily-python sentence-transformers "
                      f"scikit-learn numpy rank-bm25  |  Detail: {e}")
    except Exception as e:
        return None, f"RAG pipeline exception: {type(e).__name__}: {e}"
    finally:
        # Clean up sys.path
        if _RAG_DIR in sys.path:
            sys.path.remove(_RAG_DIR)
