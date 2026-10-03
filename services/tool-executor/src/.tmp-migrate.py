import re, pathlib, subprocess, shutil, sys

SRC = pathlib.Path(".")
SKILLS = SRC / "data/skills"
DEST = SRC / "assistants"

spec = (SRC / "adk/classification.ts").read_text()
body = spec.split("SKILL_CLASSIFICATION: Record<string, SkillClassification> = {",1)[1].split("\n};",1)[0]
CLASS = {}
for m in re.finditer(r"^\s*'?([A-Za-z0-9_-]+)'?:\s*\{\s*tier:\s*'([^']+)',\s*isSkill:\s*(true|false)\s*\}", body, re.M):
    CLASS[m.group(1)] = {"tier": m.group(2), "isSkill": m.group(3) == "true"}

ASSISTANT_DIRS = {
  "analytics":"analytics","career":"career","content":"content","creative":"songwriting",
  "cto":"cto","education":"education","event":"event","executive":"executive","finance":"finance",
  "healthcare":"healthcare","hotel":"hotel","hr":"hr","investment":"investment","legal":"legal",
  "marketing":"marketing","product":"product","restaurant":"restaurant","sales":"sales",
  "scriptwriting":"scriptwriting","songwriting":"songwriting","sports":"sports","support":"support",
}

# v9 renames: source file stem -> (dest stem, old id, new id)
RENAMES = {
  "matter-document-ops": ("document-ops", "matter-document-ops", "legal-document-ops"),
  "hotel-reservations-guest-profile": ("reservations-manager", "hotel-reservations-guest-profile", "hotel-reservations-manager"),
  "restaurant-reservations-guest-profile-manager": ("manage-reservation", "restaurant-reservations-guest-profile-manager", "restaurant-manage-reservation"),
  "marketing-analysis-user": ("campaign-execution-orchestrator", "marketing-analysis-user", "marketing-campaign-execution-orchestrator"),
  "day-of-operations": ("day-of-operations", "event-day-of-operations", "event-day-of-operations"),
}
# data files that are static domain knowledge
KNOWLEDGE_DATA = {"architecture-patterns.json", "tech-stacks.json"}

def registered_ids(text):
    return {i for i in re.findall(r"^\s+id:\s*'([^']+)'", text, re.M) if i in CLASS}

def subfolder_for(text):
    ids = registered_ids(text)
    if not ids: return None
    kinds = {CLASS[i]["isSkill"] for i in ids}
    if kinds == {True}: return "skills"
    if kinds == {False}: return "tools"
    return "skills"

plan, mixed = [], []
for folder, assistant in sorted(ASSISTANT_DIRS.items()):
    d = SKILLS / folder
    if not d.is_dir(): continue
    for f in sorted(d.iterdir()):
        if not f.is_file() or f.name == "index.ts": continue
        text = f.read_text(errors="ignore")
        if f.suffix == ".json":
            sub = "knowledge"; stem = f.stem
        else:
            sub = subfolder_for(text)
            stem = f.stem
        ids = registered_ids(text)
        kinds = {CLASS[i]["isSkill"] for i in ids}
        if len(kinds) > 1:
            mixed.append((str(f), sorted(ids)))
        plan.append((f, assistant, sub, stem))

for f, assistant, sub, stem in plan:
    target_dir = DEST / assistant if sub is None else DEST / assistant / sub
    target_dir.mkdir(parents=True, exist_ok=True)
    new_stem = RENAMES.get(f.stem, (f.stem,))[0]
    dest = target_dir / (new_stem + f.suffix)
    subprocess.run(["git", "mv", str(f), str(dest)], check=True)

# indices
for folder, assistant in sorted(ASSISTANT_DIRS.items()):
    src_index = SKILLS / folder / "index.ts"
    if not src_index.exists(): continue
    (DEST / assistant).mkdir(parents=True, exist_ok=True)
    subprocess.run(["git", "mv", str(src_index), str(DEST / assistant / "index.ts")], check=True)

print("MIXED (need manual split):", mixed)
