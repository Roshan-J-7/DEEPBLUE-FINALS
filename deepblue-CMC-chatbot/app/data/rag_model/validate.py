import json

with open(r"c:\Users\DELL\Desktop\RAG\generated_decision_tree.json", encoding="utf-8") as f:
    data = json.load(f)

symptoms = data["symptom_decision_tree"]["symptoms"]
print(f"\nTotal symptoms generated : {len(symptoms)}")
print(f"Source                   : {data['symptom_decision_tree']['meta']['source']}")
print(f"Generated date           : {data['symptom_decision_tree']['meta']['generated_date']}")
print()

REQUIRED_KEYS = [
    "symptom_id", "label", "keywords", "default_urgency",
    "triage_rationale", "immediate_red_flags", "followup_questions",
    "urgency_decision_logic", "llm_analysis_tips", "advice"
]

all_ok = True
for s in symptoms:
    missing = [k for k in REQUIRED_KEYS if k not in s]
    fq_count = len(s.get("followup_questions", {}))
    status = "OK" if not missing else f"MISSING: {missing}"
    print(f"  [{status}]  {s['symptom_id']}")
    print(f"           urgency     = {s['default_urgency']}")
    print(f"           keywords    = {len(s.get('keywords', []))} entries")
    print(f"           questions   = {fq_count}")
    print(f"           red_flags   = {len(s.get('immediate_red_flags', []))}")
    print()
    if missing:
        all_ok = False

print("JSON schema validation :", "PASSED" if all_ok else "FAILED")
