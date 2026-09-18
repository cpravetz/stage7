import re

with open('/mnt/1tbHD/ckt_web/stage7/services/tool-executor/src/data/skills/marketing/index.ts', 'r') as f:
    lines = f.readlines()

triggers = {
    'plan-campaign': {
        'user': ["Plan a campaign", "Define campaign", "Create campaign plan"],
        'schedule': ["Quarterly planning cycle", "Weekly campaign review"],
        'event': ["Campaign created", "Campaign approved", "Campaign launched"],
        'data': ["Budget threshold triggers reallocation", "Campaign performance drops"]
    },
    'analyze-performance': {
        'user': ["Analyze performance", "Check metrics", "Pull report"],
        'schedule': ["Daily metrics digest", "Weekly performance report", "Monthly executive review"],
        'event': ["Report generated", "KPI crossed", "Campaign ended"],
        'data': ["KPI underperforms", "Metric anomaly detected"]
    },
    'marketing-content-generation': {
        'user': ["Generate content", "Draft post", "Create copy"],
        'schedule': ["Daily content queue review", "Weekly content calendar sync"],
        'event': ["Content approved", "Content published", "Content rejected"],
        'data': ["Content backlog grows", "Engagement drops"]
    },
    'marketing-social-media': {
        'user': ["Post to social", "Schedule post", "Check social metrics"],
        'schedule': ["Daily social queue processing", "Weekly social performance review"],
        'event': ["Post published", "Post shared", "Comment received"],
        'data': ["Engagement rate drops", "Follower growth stalls"]
    },
    'marketing-seo': {
        'user': ["Audit SEO", "Check rankings", "Run keyword research"],
        'schedule': ["Monthly rank tracking", "Weekly SEO audit"],
        'event': ["Page published", "Ranking changed", "Crawl error detected"],
        'data': ["Ranking drops", "Keyword gap detected"]
    },
    'marketing-market-research': {
        'user': ["Research market", "Competitor analysis", "Market survey"],
        'schedule': ["Monthly market report", "Quarterly competitive review"],
        'event': ["Competitor launches", "Market shift detected", "Survey completed"],
        'data': ["Market share drops", "Trend shift detected"]
    },
    'marketing-audience-insights': {
        'user': ["Analyze audience", "Check demographics", "Audience segmentation"],
        'schedule': ["Weekly audience report", "Monthly segment review"],
        'event': ["New segment identified", "Audience behavior changed", "Persona updated"],
        'data': ["Engagement drops by segment", "Audience size shrinks"]
    },
    'marketing-email': {
        'user': ["Send email campaign", "Draft email", "Check email metrics"],
        'schedule': ["Daily email queue review", "Weekly campaign performance"],
        'event': ["Email sent", "Email opened", "Email clicked", "Unsubscribe"],
        'data': ["Open rate below threshold", "Unsubscribe rate high"]
    },
    'marketing-document-management': {
        'user': ["Upload document", "Tag asset", "Search documents"],
        'schedule': ["Weekly asset review", "Monthly compliance audit"],
        'event': ["Document uploaded", "Asset approved", "Version updated"],
        'data': ["Asset backlog grows", "Tag accuracy drops"]
    }
}

def format_triggers(t):
    lines = ['  triggers: {']
    for key, values in t.items():
        vals = ', '.join([f'"{v}"' for v in values])
        lines.append(f'    {key}: [{vals}],')
    lines.append('  },')
    return '\n'.join(lines)

# Marketing has:
# 1. Plain object skills (plan-campaign, analyze-performance) with createdAt: new Date(), updatedAt: new Date()
# 2. createExternalActionSkill factory calls (the rest)

# Handle plain object skills (type 1)
for skill_id in ['plan-campaign', 'analyze-performance']:
    if skill_id in triggers:
        trigger_data = triggers[skill_id]
        triggers_str = format_triggers(trigger_data)
        for i, line in enumerate(lines):
            if f"id: '{skill_id}'" in line:
                for j in range(i, len(lines)):
                    if 'createdAt: new Date(), updatedAt: new Date(),' in lines[j]:
                        lines.insert(j, '  ' + triggers_str + '\n')
                        break
                break

# Handle factory call skills (type 2)
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

insertions = []
for end_line, skill_id in skill_ends:
    if skill_id in triggers:
        insertions.append((end_line, skill_id))

insertions.sort(reverse=True)

for end_line, skill_id in insertions:
    triggers_str = format_triggers(triggers[skill_id])
    lines.insert(end_line, '  ' + triggers_str + '\n')

with open('/mnt/1tbHD/ckt_web/stage7/services/tool-executor/src/data/skills/marketing/index.ts', 'w') as f:
    f.writelines(lines)

content = ''.join(lines)
count = content.count('triggers: {')
print(f"Total triggers occurrences: {count}")
