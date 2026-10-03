import re, pathlib, json, collections

src = pathlib.Path(".")
skill_dir = src / "data/skills"

# classification from the ADK spec
spec = (src / "adk/classification.ts").read_text()
body = spec.split("SKILL_CLASSIFICATION: Record<string, SkillClassification> = {",1)[1]
body = body.split("\n};",1)[0]
classification = {}
for m in re.finditer(r"^\s*'?([A-Za-z0-9_-]+)'?:\s*\{\s*tier:\s*'([^']+)',\s*isSkill:\s*(true|false)\s*\}", body, re.M):
    classification[m.group(1)] = {"tier": m.group(2), "isSkill": m.group(3) == "true"}

results = collections.defaultdict(list)
for folder in sorted(skill_dir.iterdir()):
    if not folder.is_dir(): continue
    for f in sorted(folder.glob("*.ts")):
        text = f.read_text()
        ids = sorted(set(re.findall(r"^\s*id:\s*'([^']+)'", text, re.M)))
        entries = []
        for i in ids:
            c = classification.get(i)
            entries.append(f"{i}->{c['tier'] if c else '??'}/{('S' if c and c['isSkill'] else 'T') if c else '?'}")
        results[folder.name].append((f.name, entries))

for folder, files in results.items():
    if folder in ("shared",): continue
    print(f"## {folder}")
    for name, entries in files:
        print(f"  {name}: {'; '.join(entries) if entries else '(no skill ids)'}")
