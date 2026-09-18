import re

with open('/mnt/1tbHD/ckt_web/stage7/services/tool-executor/src/data/skills/product/index.ts', 'r') as f:
    lines = f.readlines()

triggers = {
    'create-roadmap': {
        'user': ["Create a roadmap", "Plan a release", "Check roadmap status"],
        'schedule': ["Weekly roadmap review", "Monthly portfolio review"],
        'event': ["Milestone completed", "Roadmap updated", "New requirement added"],
        'data': ["Roadmap coverage gap detected", "Dependency overdue"]
    },
    'write-prd': {
        'user': ["Write a PRD", "Update requirements", "Review requirements"],
        'schedule': ["Sprint planning cycle", "Monthly PRD quality review"],
        'event': ["Requirements changed", "Stakeholder feedback received", "PRD approved"],
        'data': ["Requirement coverage below threshold", "Scope creep detected"]
    },
    'product-jira': {
        'user': ["Create Jira ticket", "Update ticket", "Search tickets"],
        'schedule': ["Daily sync with Jira", "Weekly ticket health review"],
        'event': ["Ticket created", "Ticket transitioned", "Comment added"],
        'data': ["Ticket backlog grows", "Velocity drops"]
    },
    'product-confluence': {
        'user': ["Create Confluence page", "Search docs", "Update documentation"],
        'schedule': ["Weekly doc review", "Monthly knowledge audit"],
        'event': ["Page created", "Page updated", "Page commented"],
        'data': ["Stale pages detected", "Doc coverage gap"]
    },
    'product-data-analysis': {
        'user': ["Analyze product data", "Run report", "Check metrics"],
        'schedule': ["Daily metrics digest", "Weekly product analytics", "Monthly deep dive"],
        'event': ["Data source connected", "Report generated", "Data quality issue"],
        'data': ["Metric anomaly detected", "Data freshness below threshold"]
    },
    'product-slack': {
        'user': ["Post to Slack", "Send message", "Check notifications"],
        'schedule': ["Daily message review", "Weekly channel summary"],
        'event': ["Message posted", "Reaction added", "Thread updated"],
        'data': ["Response time exceeds SLA", "Unread messages spike"]
    },
    'product-calendar': {
        'user': ["Check calendar", "Schedule review", "Find meeting times"],
        'schedule': ["Daily calendar sync", "Weekly planning review"],
        'event': ["Event created", "Event cancelled", "Conflict detected"],
        'data': ["Calendar sync fails", "Scheduling backlog grows"]
    },
    'product-markdown-parsing': {
        'user': ["Parse markdown", "Convert document", "Extract content"],
        'schedule': ["Weekly parsing quality review"],
        'event': ["Document uploaded", "Parse error", "Format changed"],
        'data': ["Parse failure rate high", "Unsupported format detected"]
    }
}

def format_triggers(t):
    lines = ['  triggers: {']
    for key, values in t.items():
        vals = ', '.join([f'"{v}"' for v in values])
        lines.append(f'    {key}: [{vals}],')
    lines.append('  },')
    return '\n'.join(lines)

skill_starts = []
skill_ends = []

in_template = False
brace_count = 0
current_factory_start = -1
current_skill_id = None
skip_brace_counting_this_line = False

for i, line in enumerate(lines):
    # Check for template literal start/end
    if not in_template:
        backtick_pos = line.find('`')
        if backtick_pos != -1:
            in_template = True
            continue
    else:
        backtick_pos = line.find('`')
        if backtick_pos != -1:
            in_template = False
            continue
    
    if in_template:
        continue
    
    # Check for factory function start
    if 'createCodeSkill({' in line:
        current_factory_start = i
        brace_count = 0  # Will be incremented by brace counting below
        skip_brace_counting_this_line = True
        for j in range(i+1, min(i+10, len(lines))):
            m = re.search(r"id: '([^']+)'", lines[j])
            if m:
                current_skill_id = m.group(1)
                skill_starts.append((i, current_skill_id, 'createCodeSkill'))
                break
    elif 'createExternalActionSkill({' in line:
        current_factory_start = i
        brace_count = 0
        skip_brace_counting_this_line = True
        for j in range(i+1, min(i+10, len(lines))):
            m = re.search(r"id: '([^']+)'", lines[j])
            if m:
                current_skill_id = m.group(1)
                skill_starts.append((i, current_skill_id, 'createExternalActionSkill'))
                break
    
    # Count braces outside templates
    if current_factory_start != -1 and not skip_brace_counting_this_line:
        open_braces = line.count('{')
        close_braces = line.count('}')
        brace_count += open_braces
        brace_count -= close_braces
        if brace_count == 0:
            skill_ends.append((i, current_skill_id))
            current_factory_start = -1
            current_skill_id = None
    elif skip_brace_counting_this_line:
        skip_brace_counting_this_line = False

print(f"Found {len(skill_starts)} skill starts: {[s[1] for s in skill_starts]}")
print(f"Found {len(skill_ends)} skill ends: {[e[1] for e in skill_ends]}")

# Insert triggers before each skill end
insertions = []
for end_line, skill_id in skill_ends:
    if skill_id in triggers:
        insertions.append((end_line, skill_id))

insertions.sort(reverse=True)

for end_line, skill_id in insertions:
    triggers_str = format_triggers(triggers[skill_id])
    lines.insert(end_line, triggers_str + '\n')

with open('/mnt/1tbHD/ckt_web/stage7/services/tool-executor/src/data/skills/product/index.ts', 'w') as f:
    f.writelines(lines)

content = ''.join(lines)
count = content.count('triggers: {')
print(f"Total triggers occurrences: {count}")
