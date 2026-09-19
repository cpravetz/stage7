import json
import re

with open('/mnt/1tbHD/ckt_web/stage7/services/tool-executor/src/data/skills/legal/index.ts', 'r') as f:
    content = f.read()

triggers = {
    'review-contract': {
        'user': ["Review this contract", "Check contract terms", "Analyze contract risk"],
        'schedule': ["Weekly contract review cycle", "Monthly compliance audit"],
        'event': ["Contract uploaded", "Contract signed", "Clause flagged"],
        'data': ["Risk score exceeds threshold", "Non-compliant clause detected"]
    },
    'draft-clause': {
        'user': ["Draft a clause", "Generate clause", "Review clause"],
        'schedule': ["Weekly template review", "Monthly clause quality audit"],
        'event': ["Clause template updated", "Clause generated", "Review requested"],
        'data': ["Template coverage gap", "Clause conflict detected"]
    },
    'legal-research': {
        'user': ["Research a topic", "Find case law", "Check regulations"],
        'schedule': ["Daily research digest", "Weekly research report"],
        'event': ["New case filed", "Regulation updated", "Precedent set"],
        'data': ["Research backlog grows", "Source becomes unavailable"]
    },
    'legal-compliance': {
        'user': ["Check compliance", "Review requirements", "Audit compliance"],
        'schedule': ["Weekly compliance audit", "Monthly compliance report"],
        'event': ["Compliance flag raised", "Regulation changed", "Audit completed"],
        'data': ["Compliance violations detected", "Flag backlog grows"]
    },
    'legal-case-management': {
        'user': ["Create case", "Update case", "Track case"],
        'schedule': ["Daily case queue review", "Weekly case status report"],
        'event': ["Case created", "Case closed", "Case reassigned"],
        'data': ["Case backlog exceeds threshold", "Resolution time exceeds SLA"]
    },
    'legal-statute-database': {
        'user': ["Search statutes", "Check regulation", "Look up law"],
        'schedule': ["Weekly statute refresh", "Monthly update review"],
        'event': ["Statute added", "Statute amended", "Repealed law"],
        'data': ["Database sync fails", "Statute version mismatch"]
    },
    'legal-document-tagging': {
        'user': ["Tag document", "Classify document", "Extract metadata"],
        'schedule': ["Weekly tagging accuracy review", "Monthly tag taxonomy update"],
        'event': ["Document uploaded", "Tag applied", "Tag corrected"],
        'data': ["Tagging accuracy drops", "Untagged documents accumulate"]
    },
    'legal-case-search': {
        'user': ["Search cases", "Find precedent", "Check docket"],
        'schedule': ["Daily case update", "Weekly docket review"],
        'event': ["New case filed", "Case decided", "Case settled"],
        'data': ["Search relevance drops", "Case volume spike"]
    },
    'legal-risk-assessment': {
        'user': ["Assess risk", "Run risk analysis", "Check risk level"],
        'schedule': ["Monthly risk review", "Quarterly risk assessment"],
        'event': ["Risk score changed", "Risk event occurred", "Mitigation applied"],
        'data': ["Risk score exceeds limit", "New risk factor detected"]
    },
    'legal-ediscovery': {
        'user': ["Start ediscovery", "Collect ESI", "Review documents"],
        'schedule': ["Weekly ediscovery progress review", "Monthly preservation audit"],
        'event': ["Preservation ordered", "Document produced", "Review completed"],
        'data': ["Review backlog grows", "Production deadline approaching"]
    }
}

def quoted(value):
    return json.dumps(value, ensure_ascii=False)


def format_triggers(t):
    lines = ['  triggers: [']
    lines.append(
        "    { kind: 'user', phrase_examples: ["
        + ", ".join(quoted(value) for value in t["user"])
        + "] },"
    )
    for value in t["schedule"]:
        lines.append(f"    {{ kind: 'schedule', cadence: {quoted(value)} }},")
    for value in t["event"]:
        lines.append(f"    {{ kind: 'event', on: {quoted(value)} }},")
    for value in t["data"]:
        lines.append(f"    {{ kind: 'data', condition: {quoted(value)} }},")
    lines[-1] = lines[-1].rstrip()
    lines.append('  ],')
    return '\n'.join(lines)

# The legal file has two types of skills:
# 1. Plain objects (review-contract, draft-clause) with createdAt: new Date(), updatedAt: new Date()
# 2. createExternalActionSkill factory calls (the rest)

# For type 1: insert before "createdAt: new Date(), updatedAt: new Date(),"
# For type 2: insert before the closing }) of the factory call

lines = content.splitlines(keepends=True)

# First, handle plain object skills (type 1)
# Pattern: id: 'skill-id', ... createdAt: new Date(), updatedAt: new Date(),
for skill_id in ['review-contract', 'draft-clause']:
    if skill_id in triggers:
        trigger_data = triggers[skill_id]
        triggers_str = format_triggers(trigger_data)
        # Find the line with createdAt for this skill
        for i, line in enumerate(lines):
            if f"id: '{skill_id}'" in line:
                # Search forward for createdAt
                for j in range(i, len(lines)):
                    if 'createdAt: new Date(), updatedAt: new Date(),' in lines[j]:
                        lines.insert(j, '  ' + triggers_str + '\n')
                        break
                break

# Now handle factory call skills (type 2) - similar to product
# Parse line by line to find factory call boundaries
in_template = False
brace_count = 0
current_factory_start = -1
current_skill_id = None
skip_brace_counting = False
skill_ends = []

for i, line in enumerate(lines):
    if not in_template:
        if '`' in line:
            in_template = True
            continue
    else:
        if '`' in line:
            in_template = False
            continue
    
    if in_template:
        continue
    
    if 'createExternalActionSkill({' in line:
        current_factory_start = i
        brace_count = 0
        skip_brace_counting = True
        for j in range(i+1, min(i+10, len(lines))):
            m = re.search(r"id: '([^']+)'", lines[j])
            if m:
                current_skill_id = m.group(1)
                break
    
    if current_factory_start != -1 and not skip_brace_counting:
        open_braces = line.count('{')
        close_braces = line.count('}')
        brace_count += open_braces
        brace_count -= close_braces
        if brace_count == 0:
            skill_ends.append((i, current_skill_id))
            current_factory_start = -1
            current_skill_id = None
    elif skip_brace_counting:
        skip_brace_counting = False

# Insert triggers for factory skills
insertions = []
for end_line, skill_id in skill_ends:
    if skill_id in triggers:
        insertions.append((end_line, skill_id))

insertions.sort(reverse=True)

for end_line, skill_id in insertions:
    triggers_str = format_triggers(triggers[skill_id])
    lines.insert(end_line, '  ' + triggers_str + '\n')

updated = ''.join(lines)
if 'triggers: [' not in updated or 'triggers: {' in updated:
    raise RuntimeError('Validation failed: triggers must use SkillTrigger[] array format')

print('Validation passed: triggers are in SkillTrigger[] array format')
with open('/mnt/1tbHD/ckt_web/stage7/services/tool-executor/src/data/skills/legal/index.ts', 'w') as f:
    f.writelines(lines)

content = updated
count = content.count('triggers: [')
print(f"Total triggers occurrences: {count}")
