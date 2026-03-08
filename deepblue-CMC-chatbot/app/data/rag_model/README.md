# Medical RAG Decision Tree Generator

Generates structured medical decision trees from symptom input using Hybrid RAG + LLM.

## Stack
- **Search**: Tavily API (MedlinePlus web scraping)
- **RAG**: BM25 + Semantic Embeddings (sentence-transformers `all-MiniLM-L6-v2`)
- **LLM**: Cerebras API (`llama3.1-8b`)
- **Output**: `generated_decision_tree.json`

---

## Setup

```bash
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # Linux/Mac

pip install openai tavily-python sentence-transformers scikit-learn numpy rank-bm25
```

## Run (Interactive)

```bash
python rag_pipeline.py
```

You'll be prompted to describe symptoms in plain English. Spelling mistakes are handled automatically via LLM.

```
Your symptoms: I have a bad headche and my stomch hurts
```

---

## Backend Integration

Import and call the pipeline programmatically:

```python
from rag_pipeline import _extract_symptoms_with_llm, process_symptom, load_existing_tree, save_tree

# 1. Extract & correct symptoms from user input
symptoms = _extract_symptoms_with_llm("my head hurts and i feel dizzy")
# → ["headache", "dizziness"]

# 2. Load existing tree
tree = load_existing_tree()

# 3. Process each symptom
for symptom in symptoms:
    node = process_symptom(symptom)   # runs RAG + LLM, returns decision tree node
    if node:
        tree["symptoms"][symptom.lower()] = node

# 4. Save
save_tree(tree)
```

### Output Schema (`generated_decision_tree.json`)

```json
{
  "symptoms": {
    "headache": {
      "symptom": "Headache",
      "description": "...",
      "questions": [...],
      "conditions": [...],
      "emergency_signs": [...],
      "general_advice": "..."
    }
  }
}
```

---

## API Keys

Set in `rag_pipeline.py` (top of file):

```python
TAVILY_API_KEY   = "your-tavily-key"
CEREBRAS_API_KEY = "your-cerebras-key"
```
