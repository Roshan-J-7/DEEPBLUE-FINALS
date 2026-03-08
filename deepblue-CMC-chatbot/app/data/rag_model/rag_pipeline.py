"""
Medical RAG Decision Tree Generator
====================================
Source  : MedlinePlus (https://medlineplus.gov/) + Mayo Clinic fallback
Search  : Tavily API
RAG     : Hybrid RAG — BM25 (rank_bm25) + semantic embeddings (sentence-transformers)
LLM     : Cerebras API  (llama3.3-70b primary, llama3.1-8b fallback)
Output  : generated_decision_tree.json  (same schema as decision_tree.json)
"""

import json
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date

import numpy as np
from openai import OpenAI
from sklearn.metrics.pairwise import cosine_similarity
from tavily import TavilyClient

# ─────────────────────────────  API KEYS  ────────────────────────────────────
from dotenv import load_dotenv
load_dotenv()
TAVILY_API_KEY   = os.getenv("TAVILY_API_KEY")
CEREBRAS_API_KEY = os.getenv("RAG_CEREBRAS_API_KEY")

# ─────────────────────  GLOBAL EMBEDDER SINGLETON  ───────────────────────────
# Loaded once per process — all HybridRAG instances share it.
_EMBEDDER = None

def _get_global_embedder():
    global _EMBEDDER
    if _EMBEDDER is None:
        from sentence_transformers import SentenceTransformer
        print("  [Embedder] Loading all-MiniLM-L6-v2 (one-time) …")
        _EMBEDDER = SentenceTransformer("all-MiniLM-L6-v2")
        print("  [Embedder] Ready.")
    return _EMBEDDER

# ─────────────────────  CEREBRAS CLIENT (OpenAI-compat)  ─────────────────────
cerebras = OpenAI(
    api_key=CEREBRAS_API_KEY,
    base_url="https://api.cerebras.ai/v1",
)

# ─────────────────────────────  TAVILY CLIENT  ───────────────────────────────
tavily = TavilyClient(api_key=TAVILY_API_KEY)

# ──────────────────────────────  SYMPTOM EXTRACTOR  ──────────────────────────
def _extract_symptoms_with_llm(raw_input: str) -> list[str]:
    """
    Use Cerebras LLM to:
      • Understand free-form / conversational symptom descriptions
      • Fix spelling mistakes  (e.g. "stomch ake" → "stomach ache")
      • Extract each distinct symptom as a clean, standard medical term
    Returns a list of corrected symptom strings.
    """
    prompt = (
        "You are a medical NLP assistant. "
        "The user has typed the following text describing their symptoms — "
        "it may contain spelling mistakes, slang, or be a full sentence:\n\n"
        f'"{raw_input}"\n\n'
        "Tasks:\n"
        "1. Identify every symptom or medical complaint mentioned.\n"
        "2. Correct any spelling mistakes and normalise to standard medical terms.\n"
        "3. Return ONLY a JSON array of strings — one clean symptom per element. "
        "No explanation, no markdown, no extra text.\n"
        'Example output: ["chest pain", "fever", "headache"]'
    )

    for model in ("llama3.1-8b",):
        try:
            resp = cerebras.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0,
                max_tokens=256,
            )
            content = resp.choices[0].message.content.strip()
            # Extract the JSON array even if wrapped in markdown fences
            match = re.search(r"\[.*?\]", content, re.DOTALL)
            if match:
                symptoms = json.loads(match.group())
                if isinstance(symptoms, list) and symptoms:
                    return [str(s).strip() for s in symptoms if str(s).strip()]
        except Exception as exc:
            print(f"  [LLM Extract] Warning: {exc}")

    # Fallback: naive comma-split on the original input
    return [s.strip() for s in raw_input.split(",") if s.strip()]


def get_symptoms_from_user() -> list[str]:
    print("\n" + "─" * 60)
    print("  Describe your symptoms in plain English.")
    print("  You can type a sentence, list them, or mix both.")
    print("  Spelling mistakes are handled automatically.")
    print("  Example: \"I have a bad headche and my stomch hurts\"")
    print("─" * 60)
    raw = input("  Your symptoms: ").strip()
    if not raw:
        print("  Nothing entered. Exiting.")
        sys.exit(0)

    print("\n  [NLP] Extracting & correcting symptoms via LLM …")
    symptoms = _extract_symptoms_with_llm(raw)

    if not symptoms:
        print("  Could not identify any symptoms. Exiting.")
        sys.exit(0)

    print(f"  → Identified {len(symptoms)} symptom(s): {', '.join(symptoms)}\n")
    return symptoms

MEDLINE_BASE = "https://medlineplus.gov/"

# ──────────────────────────────────────────────────────────────────────────────
#  TEXT CLEANING  +  SENTENCE-AWARE CHUNKER
# ──────────────────────────────────────────────────────────────────────────────
def _clean_scraped_text(text: str) -> str:
    """Remove nav junk, cookie banners, and very short fragments."""
    text = re.sub(r"\s+", " ", text).strip()
    sentences = re.split(r"(?<=[.!?])\s+", text)
    sentences = [s.strip() for s in sentences if len(s.strip()) >= 45]
    return " ".join(sentences)


def _sentence_chunk(text: str, chunk_size: int = 700,
                    overlap_sentences: int = 2) -> list[str]:
    """Split text into overlapping chunks aligned to sentence boundaries."""
    sentences = re.split(r"(?<=[.!?])\s+", text)
    chunks, current, current_len = [], [], 0
    for sent in sentences:
        if current_len + len(sent) > chunk_size and current:
            chunks.append(" ".join(current))
            current = current[-overlap_sentences:]
            current_len = sum(len(s) for s in current)
        current.append(sent)
        current_len += len(sent)
    if current:
        chunks.append(" ".join(current))
    return [c for c in chunks if c.strip()]


# ══════════════════════════════════════════════════════════════════════════════
#  HYBRID RAG ENGINE  (BM25 keyword  +  semantic embeddings)
# ══════════════════════════════════════════════════════════════════════════════
class HybridRAG:
    """
    Hybrid RAG combining:
      • BM25  (rank_bm25)             – exact / keyword relevance
      • Semantic cosine similarity    – sentence-transformers embeddings
    Final score = semantic_weight * semantic + (1 - semantic_weight) * bm25
    """

    def __init__(self, chunk_size: int = 700, overlap_sentences: int = 2,
                 semantic_weight: float = 0.6):
        self.chunks: list[dict]   = []
        self.chunk_size           = chunk_size
        self.overlap_sentences    = overlap_sentences
        self.semantic_weight      = semantic_weight
        self._bm25                = None
        self._tokenized           = []
        self._embedder            = None
        self._chunk_embeddings    = None

    # ── use the module-level singleton ────────────────────────────────────────
    def _get_embedder(self):
        return _get_global_embedder()

    # ── add & clean document ──────────────────────────────────────────────────
    def add_document(self, text: str, source: str = ""):
        text = _clean_scraped_text(text)
        new_chunks = _sentence_chunk(text, self.chunk_size, self.overlap_sentences)
        for chunk in new_chunks:
            self.chunks.append({"text": chunk, "source": source})
        print(f"    [RAG] Stored {len(self.chunks)} chunks from '{source}'")

    # ── build BM25 + embedding index ──────────────────────────────────────────
    def build_index(self):
        if not self.chunks:
            print("    [RAG] No chunks to index.")
            return
        from rank_bm25 import BM25Okapi
        texts = [c["text"] for c in self.chunks]
        self._tokenized = [t.lower().split() for t in texts]
        self._bm25 = BM25Okapi(self._tokenized)
        embedder = self._get_embedder()
        self._chunk_embeddings = embedder.encode(
            texts, show_progress_bar=False, batch_size=32
        )
        print(f"    [RAG] Hybrid index built — {len(self.chunks)} chunks "
              f"(BM25 + semantic embeddings)")

    # ── hybrid retrieve ───────────────────────────────────────────────────────
    def retrieve(self, query: str, top_k: int = 8) -> list[str]:
        if self._bm25 is None or not self.chunks:
            return []
        # BM25 scores (normalised 0-1)
        bm25_raw   = np.array(self._bm25.get_scores(query.lower().split()), dtype=float)
        bm25_max   = bm25_raw.max()
        bm25_scores = bm25_raw / bm25_max if bm25_max > 0 else bm25_raw
        # Semantic scores
        embedder   = self._get_embedder()
        q_emb      = embedder.encode([query], show_progress_bar=False)
        sem_scores = cosine_similarity(q_emb, self._chunk_embeddings)[0]
        # Weighted hybrid
        combined = self.semantic_weight * sem_scores + \
                   (1.0 - self.semantic_weight) * bm25_scores
        top_i = np.argsort(combined)[::-1][:top_k]
        return [self.chunks[i]["text"] for i in top_i if combined[i] > 0.05]


# ══════════════════════════════════════════════════════════════════════════════
#  STEP 1 – FETCH FROM MEDLINEPLUS VIA TAVILY
# ══════════════════════════════════════════════════════════════════════════════
def fetch_medlineplus(symptom: str) -> str:
    """
    Query Tavily with site:medlineplus.gov to get authoritative medical
    content about the symptom.  Returns combined raw text.
    """
    queries = [
        f"site:medlineplus.gov {symptom} symptoms causes",
        f"site:medlineplus.gov {symptom} diagnosis treatment when to see doctor",
        f"site:medlineplus.gov {symptom} emergency warning signs",
    ]

    combined = f"=== MEDLINEPLUS INFORMATION: {symptom.upper()} ===\n\n"
    seen_urls: set[str] = set()

    # ── run all 3 MedlinePlus queries IN PARALLEL ─────────────────────────────
    def _tavily_search(q):
        return tavily.search(
            query=q,
            search_depth="advanced",
            max_results=4,
            include_raw_content=True,
            include_answer=True,
        )

    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = {pool.submit(_tavily_search, q): q for q in queries}
        for future in as_completed(futures):
            try:
                result = future.result()
                if result.get("answer"):
                    combined += f"[Summary] {result['answer']}\n\n"
                for r in result.get("results", []):
                    url = r.get("url", "")
                    if url in seen_urls:
                        continue
                    seen_urls.add(url)
                    content = r.get("raw_content") or r.get("content") or ""
                    if content.strip():
                        combined += f"[Source: {url}]\n{content.strip()}\n\n"
            except Exception as exc:
                print(f"    [Tavily] Warning – query failed: {exc}")

    print(f"    [Tavily] Fetched {len(combined)} chars from {len(seen_urls)} URLs")

    # ── Fallback: if MedlinePlus content is sparse, also query Mayo Clinic ────
    if len(combined) < 4000:
        print(f"    [Tavily] Content sparse ({len(combined)} chars) "
              f"— fetching Mayo Clinic fallback …")
        fallback_queries = [
            f"site:mayoclinic.org {symptom} symptoms causes diagnosis",
            f"site:mayoclinic.org {symptom} treatment when to see doctor emergency",
        ]
        # ── fallback queries also run in parallel ─────────────────────────────
        def _tavily_fallback(q):
            return tavily.search(
                query=q,
                search_depth="advanced",
                max_results=3,
                include_raw_content=True,
                include_answer=True,
            )
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = {pool.submit(_tavily_fallback, q): q for q in fallback_queries}
            for future in as_completed(futures):
                try:
                    result = future.result()
                    if result.get("answer"):
                        combined += f"[Summary] {result['answer']}\n\n"
                    for r in result.get("results", []):
                        url = r.get("url", "")
                        if url in seen_urls:
                            continue
                        seen_urls.add(url)
                        content = r.get("raw_content") or r.get("content") or ""
                        if content.strip():
                            combined += f"[Source: {url}]\n{content.strip()}\n\n"
                except Exception as exc:
                    print(f"    [Tavily] Fallback query failed: {exc}")
        print(f"    [Tavily] After fallback: {len(combined)} chars total")

    return combined


# ══════════════════════════════════════════════════════════════════════════════
#  STEP 2 – CEREBRAS LLM  →  structured decision-tree JSON
# ══════════════════════════════════════════════════════════════════════════════
SYSTEM_PROMPT = """You are a senior medical AI engineer and clinical decision-support specialist.
Your job is to produce a SINGLE, VALID JSON object (no markdown fences, no extra text) 
that represents a clinical triage decision tree for a given medical symptom.
The JSON must follow the exact schema provided by the user and use ONLY medically accurate
information drawn from the provided RAG context."""


def build_llm_prompt(symptom: str, rag_chunks: list[str]) -> str:
    rag_text = "\n\n---\n\n".join(rag_chunks) if rag_chunks else "(no RAG context retrieved)"

    # Truncate so we stay within context window
    if len(rag_text) > 8000:
        rag_text = rag_text[:8000] + "\n... [truncated]"

    return f"""
=== RETRIEVED MEDICAL CONTEXT (RAG – MedlinePlus) ===
{rag_text}

=== TASK ===
Using ONLY the medical information above, generate a comprehensive clinical decision-tree JSON
object for the symptom: "{symptom}"

The JSON object must follow this EXACT schema (same field names, same nesting depth):

{{
  "symptom_id": "<snake_case_id>",
  "label": "<Human Readable Label>",
  "keywords": [
    "keyword1", "keyword2", "...(12-16 terms a patient might use)"
  ],
  "default_urgency": "<red_emergency | yellow_doctor_visit | green_home_care>",

  "triage_rationale": {{
    "why_assess_carefully": ["reason1", "reason2", "reason3", "reason4"],
    "age_factor": "<age-specific consideration>",
    "sex_specific_notes": "<sex-specific note if applicable>",
    "pregnancy_note": "<pregnancy-specific note>"
  }},

  "immediate_red_flags": [
    "red flag 1", "red flag 2", "red flag 3", "red flag 4", "red flag 5"
  ],

  "followup_questions": {{
    "onset_type": {{
      "question": "<How did the {symptom} start?>",
      "type": "single_choice",
      "options": ["sudden", "gradual_over_minutes", "gradual_over_hours_days", "chronic_recurring", "not_sure"]
    }},
    "severity": {{
      "question": "<How severe is the {symptom} right now?>",
      "type": "single_choice",
      "options": ["mild", "moderate", "severe", "very_severe_unbearable"]
    }},
    "duration": {{
      "question": "<How long have you had this {symptom}?>",
      "type": "single_choice",
      "options": ["less_than_24_hours", "1_3_days", "4_7_days", "more_than_1_week", "chronic_months"]
    }},
    "pain_character": {{
      "question": "<Symptom-appropriate character question>",
      "type": "single_choice",
      "options": ["option1", "option2", "option3", "option4", "other"]
    }},
    "associated_symptoms": {{
      "question": "<Which other symptoms are present with the {symptom}?>",
      "type": "multi_choice",
      "options": ["symptom_a", "symptom_b", "symptom_c", "symptom_d", "symptom_e", "none"]
    }},
    "aggravating_factors": {{
      "question": "<What makes the {symptom} worse?>",
      "type": "multi_choice",
      "options": ["factor1", "factor2", "factor3", "factor4", "nothing_specific"]
    }},
    "relieving_factors": {{
      "question": "<What makes the {symptom} better?>",
      "type": "multi_choice",
      "options": ["factor1", "factor2", "factor3", "nothing_helps"]
    }}
  }},

  "urgency_decision_logic": {{
    "red_emergency": [
      "Condition that requires immediate ER", "...(3-5 items)"
    ],
    "yellow_doctor_visit": [
      "Condition that requires doctor visit", "...(3-5 items)"
    ],
    "green_home_care": [
      "Condition that can be managed at home", "...(3-5 items)"
    ]
  }},

  "llm_analysis_tips": [
    "tip1", "tip2", "tip3", "tip4"
  ],

  "advice": {{
    "action": "<Primary recommended action string>",
    "emergency_if": ["condition1", "condition2", "condition3"],
    "doctor_visit_if": ["condition1", "condition2"],
    "home_care_if": ["condition1", "condition2"],
    "reason": "<Short reason for the primary action>",
    "do_not_delay": <true | false>
  }}
}}

RULES:
1. Use ONLY medically accurate information from the RAG context.
2. Replace ALL placeholder text (e.g. "option1", "factor1") with real medical terms.
3. The followup_questions must be clinically relevant to "{symptom}".
4. Return ONLY the raw JSON object — NO markdown fences, NO explanation text.
5. Ensure the JSON is 100% valid and parseable.
"""


def call_cerebras(symptom: str, rag_chunks: list[str]) -> dict:
    """Call Cerebras LLM and parse the returned JSON."""
    prompt  = build_llm_prompt(symptom, rag_chunks)

    models_to_try = [
        "llama3.1-8b",    # only available model
    ]

    raw_response = ""
    for model in models_to_try:
        try:
            print(f"    [Cerebras] Trying model: {model}")
            resp = cerebras.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user",   "content": prompt},
                ],
                temperature=0.15,   # lower = more deterministic, better JSON
                max_tokens=6000,    # give 70b more room for detailed output
            )
            raw_response = resp.choices[0].message.content.strip()
            print(f"    [Cerebras] Got {len(raw_response)} chars from model '{model}'")
            break
        except Exception as exc:
            print(f"    [Cerebras] Model '{model}' failed: {exc}")
            continue

    if not raw_response:
        raise RuntimeError("All Cerebras models failed.")

    # ── strip markdown fences if the model added them ─────────────────────────
    cleaned = raw_response
    if "```json" in cleaned:
        cleaned = cleaned.split("```json", 1)[1].split("```", 1)[0].strip()
    elif "```" in cleaned:
        cleaned = cleaned.split("```", 1)[1].split("```", 1)[0].strip()

    # ── find the outer JSON object ────────────────────────────────────────────
    brace_start = cleaned.find("{")
    brace_end   = cleaned.rfind("}")
    if brace_start != -1 and brace_end != -1:
        cleaned = cleaned[brace_start : brace_end + 1]

    return json.loads(cleaned)


# ══════════════════════════════════════════════════════════════════════════════
#  MAIN PIPELINE
# ══════════════════════════════════════════════════════════════════════════════
def run_pipeline(symptoms: list[str]) -> dict:
    final_output = {
        "symptom_decision_tree": {
            "meta": {
                "version": "2.0",
                "purpose": "Symptom-specific triage + deep-dive questionnaire",
                "source": "MedlinePlus via Tavily RAG + Cerebras LLM",
                "generated_date": str(date.today()),
                "medlineplus_url": MEDLINE_BASE,
                "assumes_prior_data": [
                    "age",
                    "sex_at_birth",
                    "pregnancy_status",
                    "chief_complaint",
                    "onset",
                    "severity",
                    "associated_symptoms",
                    "past_medical_conditions",
                    "current_medications",
                    "allergies",
                    "recent_events",
                ],
            },
            "symptoms": [],
        }
    }

    errors = []

    for idx, symptom in enumerate(symptoms, 1):
        sep = "=" * 60
        print(f"\n{sep}")
        print(f"  [{idx}/{len(symptoms)}]  PROCESSING: {symptom.upper()}")
        print(sep)

        try:
            # ── 1. Fetch from MedlinePlus ──────────────────────────────────
            print("  Step 1 → Fetching from MedlinePlus via Tavily …")
            raw_text = fetch_medlineplus(symptom)

            # ── 2. Build Hybrid RAG ────────────────────────────────────────
            print("  Step 2 → Chunking & indexing in Hybrid RAG …")
            rag = HybridRAG(chunk_size=700, overlap_sentences=2, semantic_weight=0.6)
            rag.add_document(raw_text, source=f"medlineplus:{symptom}")
            rag.build_index()

            # ── 3. Retrieve via 3 targeted sub-queries (deduplicated) ──────
            print("  Step 3 → Retrieving relevant chunks (multi-query) …")
            sub_queries = [
                f"{symptom} emergency red flags warning signs when to call ambulance",
                f"{symptom} causes risk factors diagnosis tests",
                f"{symptom} treatment home care medications when to see doctor",
            ]
            seen_texts: set[str] = set()
            chunks: list[str] = []
            for sq in sub_queries:
                for chunk in rag.retrieve(sq, top_k=5):
                    if chunk not in seen_texts:
                        seen_texts.add(chunk)
                        chunks.append(chunk)
            chunks = chunks[:12]   # cap to avoid overflowing LLM context window
            print(f"    [RAG] Retrieved {len(chunks)} deduplicated chunks for LLM context")

            # ── 4. Cerebras LLM → structured JSON ─────────────────────────
            print("  Step 4 → Sending to Cerebras LLM …")
            symptom_node = call_cerebras(symptom, chunks)

            final_output["symptom_decision_tree"]["symptoms"].append(symptom_node)
            print(f"  ✓  Successfully generated: {symptom_node.get('label', symptom)}")

        except Exception as exc:
            print(f"  ✗  ERROR processing '{symptom}': {exc}")
            errors.append({"symptom": symptom, "error": str(exc)})

    if errors:
        final_output["symptom_decision_tree"]["errors"] = errors

    return final_output


# ──────────────────────────────────────────────────────────────────────────────
#  CACHE HELPERS
# ──────────────────────────────────────────────────────────────────────────────
def _normalize(text: str) -> str:
    """
    Strip ALL non-alphanumeric characters and lowercase.
    'ear pain', 'earpain', 'ear_pain', 'EarPain', 'ear-pain' all → 'earpain'.
    Used for fuzzy cache matching regardless of spacing/formatting.
    """
    return re.sub(r"[^a-z0-9]", "", text.lower())


def _load_cached_ids(output_path: str) -> set[str]:
    """Return set of NORMALIZED symptom_ids already saved in the output file."""
    if not os.path.exists(output_path):
        return set()
    try:
        with open(output_path, "r", encoding="utf-8") as fh:
            existing = json.load(fh)
        return {
            _normalize(s["symptom_id"])
            for s in existing["symptom_decision_tree"]["symptoms"]
        }
    except Exception:
        return set()


# ══════════════════════════════════════════════════════════════════════════════
#  ENTRY POINT
# ══════════════════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    print("\n" + "█" * 60)
    print("  MEDICAL RAG DECISION TREE GENERATOR")
    print("  Source   : MedlinePlus (https://medlineplus.gov/)")
    print("  Search   : Tavily API (advanced web search)")
    print("  RAG      : TF-IDF in-memory vector store")
    print("  LLM      : Cerebras API")
    print("█" * 60)

    symptoms = get_symptoms_from_user()

    output_path = r"c:\Users\DELL\Desktop\RAG\generated_decision_tree.json"

    # ── Skip symptoms that are already cached ─────────────────────────────────
    cached_ids = _load_cached_ids(output_path)   # normalized (no separators)
    new_symptoms, skipped_symptoms = [], []
    for s in symptoms:
        if _normalize(s) in cached_ids:
            skipped_symptoms.append(s)
        else:
            new_symptoms.append(s)

    if skipped_symptoms:
        print("\n" + "─" * 60)
        print("  [Cache] Already processed — skipping RAG for:")
        for s in skipped_symptoms:
            print(f"    • {s}")
        print("─" * 60)

    if not new_symptoms:
        print("\n  All entered symptoms are already cached. Nothing to do.\n")
        sys.exit(0)

    result = run_pipeline(new_symptoms)

    # ── Merge new symptoms into existing file (avoid overwriting old data) ────
    if os.path.exists(output_path):
        with open(output_path, "r", encoding="utf-8") as fh:
            existing = json.load(fh)
        existing_ids = {
            s["symptom_id"]
            for s in existing["symptom_decision_tree"]["symptoms"]
        }
        new_nodes = result["symptom_decision_tree"]["symptoms"]
        added, skipped = 0, 0
        for node in new_nodes:
            if node["symptom_id"] not in existing_ids:
                existing["symptom_decision_tree"]["symptoms"].append(node)
                added += 1
            else:
                # overwrite with freshly generated version
                existing["symptom_decision_tree"]["symptoms"] = [
                    node if s["symptom_id"] == node["symptom_id"] else s
                    for s in existing["symptom_decision_tree"]["symptoms"]
                ]
                skipped += 1
        # update meta date
        existing["symptom_decision_tree"]["meta"]["generated_date"] = str(date.today())
        result = existing
        print(f"  [Merge] Added {added} new, updated {skipped} existing symptom(s)")
    else:
        print("  [Merge] Creating new file")
    with open(output_path, "w", encoding="utf-8") as fh:
        json.dump(result, fh, indent=2, ensure_ascii=False)

    print("\n" + "█" * 60)
    n_ok = len(result["symptom_decision_tree"]["symptoms"])
    n_er = len(result["symptom_decision_tree"].get("errors", []))
    print(f"  ✓  Pipeline complete")
    print(f"  ✓  Symptoms generated : {n_ok}")
    if n_er:
        print(f"  ✗  Errors            : {n_er}")
    print(f"  ✓  Output saved to   : {output_path}")
    print("█" * 60 + "\n")

    sys.exit(0 if n_er == 0 else 1)
