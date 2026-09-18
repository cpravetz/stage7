import re
import json

# ============================================================
# CTO TRIGGERS DATA
# ============================================================
cto_triggers = {
    'architecture-review': {
        'user': ["Review architecture", "Assess technical debt", "Check system health"],
        'schedule': ["Monthly architecture review", "Quarterly technology review"],
        'event': ["Architecture decision made", "Tech debt flagged", "System incident"]
    },
    'tech-stack-recommendation': {
        'user': ["Recommend technology", "Evaluate stack", "Compare technologies"],
        'schedule': ["Quarterly tech radar update"],
        'event': ["New technology released", "Vendor announcement", "Stack decision finalized"],
        'data': ["Technology adoption gap detected"]
    },
    'cto-jira': {
        'user': ["Create Jira ticket", "Update ticket", "Search issues"],
        'schedule': ["Daily sync", "Weekly backlog review"],
        'event': ["Ticket created", "Ticket transitioned", "Sprint completed"]
    },
    'cto-datadog': {
        'user': ["Check metrics", "Create dashboard", "Set alert"],
        'schedule': ["Daily metrics review"],
        'event': ["Alert triggered", "Dashboard shared", "Metric anomaly"]
    },
    'cto-github': {
        'user': ["Create PR", "Review code", "Check issues"],
        'schedule': ["Daily PR review", "Weekly sprint review"],
        'event': ["PR opened", "PR merged", "Issue created"]
    },
    'cto-aws': {
        'user': ["Check AWS resources", "Review costs", "Check service health"],
        'schedule': ["Weekly cost review", "Monthly resource audit"],
        'event': ["Service outage", "Cost spike", "Resource created"]
    },
    'cto-gcp': {
        'user': ["Check GCP resources", "Review costs", "Check service health"],
        'schedule': ["Weekly cost review", "Monthly resource audit"],
        'event': ["Service outage", "Cost spike", "Resource created"]
    },
    'cto-azure': {
        'user': ["Check Azure resources", "Review costs", "Check service health"],
        'schedule': ["Weekly cost review", "Monthly resource audit"],
        'event': ["Service outage", "Cost spike", "Resource created"]
    },
    'cto-pagerduty': {
        'user': ["Check incidents", "Create on-call", "Review alerts"],
        'schedule': ["Daily incident review"],
        'event': ["Incident created", "Alert triggered", "On-call changed"]
    },
    'cto-kubernetes': {
        'user': ["Check cluster health", "Scale deployment", "Check pod status"],
        'schedule': ["Daily cluster review", "Weekly capacity review"],
        'event': ["Pod crashed", "Node added", "Deployment updated"]
    },
    'cto-cost-optimization': {
        'user': ["Analyze costs", "Find savings", "Review budget"],
        'schedule': ["Monthly cost analysis", "Quarterly optimization review"],
        'event': ["Cost anomaly detected", "Recommendation generated", "Savings realized"]
    },
    'cto-team-metrics': {
        'user': ["Check velocity", "Review team performance", "Check cycle time"],
        'schedule': ["Weekly team metrics", "Monthly performance review"],
        'event': ["Sprint completed", "Metric threshold crossed"]
    },
    'cto-iac-monitoring': {
        'user': ["Check infrastructure", "Review drift", "Check compliance"],
        'schedule': ["Daily drift check", "Weekly compliance review"],
        'event': ["Drift detected", "Compliance violation", "Infrastructure updated"]
    },
    'cto-database-operations': {
        'user': ["Check database health", "Run migration", "Check replication"],
        'schedule': ["Daily health check", "Weekly backup verification"],
        'event': ["Replication lag", "Migration completed", "Backup failed"]
    },
    'cto-service-mesh': {
        'user': ["Check mesh health", "Review traffic", "Check service discovery"],
        'schedule': ["Daily mesh review"],
        'event': ["Service down", "Traffic spike", "Route changed"]
    },
    'cto-disaster-recovery': {
        'user': ["Test DR plan", "Check RPO/RTO", "Review failover"],
        'schedule': ["Quarterly DR test", "Monthly DR review"],
        'event': ["Failover triggered", "DR test completed", "Recovery point exceeded"]
    }
}

# ============================================================
# SPORTS TRIGGERS DATA (with fixed ID for first skill)
# ============================================================
sports_triggers = {
    'analyze-matchup': {  # Fixed from createCodeSkill
        'user': ["Analyze matchup", "Predict outcome", "Compare teams"],
        'schedule': ["Daily matchup analysis", "Weekly season preview"],
        'event': ["Game started", "Line released", "Injury reported"]
    },
    'sports-betting-risk-assessment': {
        'user': ["Assess betting risk", "Check exposure", "Review limits"],
        'schedule': ["Daily risk review", "Weekly exposure report"],
        'event': ["Bet placed", "Limit approached", "Risk threshold crossed"]
    },
    'sports-odds-data-collector': {
        'user': ["Collect odds", "Check lines", "Compare books"],
        'schedule': ["Odds refresh every 5 minutes", "Daily odds summary"],
        'event': ["Line moved", "New game announced", "Odds error"]
    },
    'sports-value-betting-analyzer': {
        'user': ["Find value bets", "Analyze edge", "Check ROI"],
        'schedule': ["Daily value scan", "Weekly performance review"],
        'event': ["Value bet found", "ROI dropped", "Edge disappeared"]
    },
    'sports-odds-comparison': {
        'user': ["Compare odds", "Find best line", "Arbitrage check"],
        'schedule': ["Odds comparison every 15 minutes", "Weekly arb report"],
        'event': ["Line divergence detected", "Arbitrage opportunity", "Odds updated"]
    },
    'sports-betting-performance-analyzer': {
        'user': ["Check betting stats", "Review profit", "Check win rate"],
        'schedule': ["Daily performance digest", "Monthly deep dive"],
        'event': ["Bet resolved", "Profit threshold crossed", "Streak ended"]
    },
    'sports-bankroll-manager': {
        'user': ["Check bankroll", "Set stake size", "Review betting history"],
        'schedule': ["Daily bankroll check", "Weekly bankroll review"],
        'event': ["Stake placed", "Bankroll changed", "Limit reached"]
    },
    'sports-performance-optimizer': {
        'user': ["Optimize lineup", "Check player stats", "Find best lineup"],
        'schedule': ["Daily lineup optimization", "Weekly performance review"],
        'event': ["Lineup optimized", "Player status changed", "Game started"]
    },
    'sports-stats-collector': {
        'user': ["Collect stats", "Check box score", "Pull stats"],
        'schedule': ["Live stat refresh", "Post-game stat review"],
        'event': ["Stats updated", "Game completed", "Player traded"]
    },
    'sports-performance-modeling': {
        'user': ["Model performance", "Predict stats", "Build projection"],
        'schedule': ["Weekly model update", "Monthly model review"],
        'event': ["Model updated", "Projection generated", "Player injury"]
    },
    'sports-prediction-engine': {
        'user': ["Get prediction", "Check confidence", "Review picks"],
        'schedule': ["Daily predictions", "Weekly pick review"],
        'event': ["Prediction made", "Game ended", "Pick resolved"]
    },
    'sports-responsible-gambling': {
        'user': ["Check limits", "Review history", "Set self-exclusion"],
        'schedule': ["Daily limit check"],
        'event': ["Self-exclusion requested", "Limit changed", "Warning triggered"]
    },
    'sports-gambling-risk-analyzer': {
        'user': ["Analyze gambling risk", "Check addiction flags", "Review behavior"],
        'schedule': ["Weekly risk analysis"],
        'event': ["Risk flag raised", "Behavior pattern detected", "Intervention needed"]
    },
    'sports-responsible-gambling-planner': {
        'user': ["Create responsible plan", "Set safeguards", "Review plan"],
        'schedule': ["Monthly plan review"],
        'event': ["Plan created", "Safeguard triggered", "Plan updated"]
    },
    'sports-live-data-collector': {
        'user': ["Check live data", "Get in-game stats", "Track live events"],
        'schedule': ["Live data refresh"],
        'event': ["Game started", "Stat updated", "Timeout occurred"]
    },
    'sports-in-game-analyzer': {
        'user': ["Analyze in-game", "Check live odds", "Track momentum"],
        'schedule': ["Live analysis during games"],
        'event': ["Momentum shift", "Key play", "Timeout"],
        'data': ["Momentum score changes", "Live odds discrepancy"]
    },
    'sports-live-betting-advisor': {
        'user': ["Get live bet advice", "Check live value", "Recommend bet"],
        'schedule': ["Live bet refresh during games"],
        'event': ["Live bet recommended", "Line moved", "Bet placed"]
    }
}

def format_triggers(triggers_dict):
    """Format triggers dict as TypeScript object string"""
    lines = []
    for kind, phrases in triggers_dict.items():
        phrases_str = ', '.join(f'"{p}"' for p in phrases)
        lines.append(f'        {kind}: [{phrases_str}]')
    return '{\n' + ',\n'.join(lines) + '\n      }'

def add_triggers_to_cto(content):
    """Add triggers to CTO skills"""
    # For each skill, find the closing brace of the skill object and add triggers before it
    # The skills are in CTO_TOOLS array (first 2) and CTO_EXTERNAL_SKILLS array (rest)
    
    # We'll use a more targeted approach: find each skill by ID and insert triggers
    for skill_id, triggers in cto_triggers.items():
        triggers_str = format_triggers(triggers)
        
        # Pattern to find the skill object with this ID
        # The skill ends with `},` or `}]` (for the last in array)
        # We need to insert triggers before the closing `},`
        
        # Find the skill definition - look for the id field
        pattern = rf'(id:\s*[\'"]{re.escape(skill_id)}[\'"].*?)(^\s*}},?\s*$)'
        match = re.search(pattern, content, re.MULTILINE | re.DOTALL)
        
        if match:
            # Find the position of the closing }, for this skill
            # We need to insert triggers before the last }, in the skill object
            skill_start = match.start()
            skill_content = match.group(1)
            
            # Find the last occurrence of }, in the skill content
            # But we need to be careful about nested objects
            # Better approach: find the skill object boundaries
            
            # Let's use a simpler approach: find the line with the id and then find the closing },
            # by counting braces
            pass
    
    # Simpler approach: parse line by line
    lines = content.split('\n')
    new_lines = []
    i = 0
    in_cto_tools = False
    in_cto_external = False
    brace_count = 0
    current_skill_id = None
    skill_start_idx = None
    skill_brace_count = 0
    collecting_skill = False
    
    while i < len(lines):
        line = lines[i]
        
        # Track array contexts
        if 'const CTO_TOOLS: Tool[] = [' in line:
            in_cto_tools = True
        if 'const CTO_EXTERNAL_SKILLS: Tool[] = [' in line:
            in_cto_external = True
            in_cto_tools = False
        
        # Detect skill ID
        id_match = re.search(r"id:\s*[\'\"]([^\'\"]+)[\'\"]", line)
        if id_match and (in_cto_tools or in_cto_external):
            current_skill_id = id_match.group(1)
            skill_start_idx = len(new_lines)
            skill_brace_count = 0
            collecting_skill = True
        
        # Count braces in skill object
        if collecting_skill:
            skill_brace_count += line.count('{')
            skill_brace_count -= line.count('}')
            
            # When brace count returns to 0, we've closed the skill object
            if skill_brace_count == 0 and current_skill_id in cto_triggers:
                # Insert triggers before this closing line
                triggers_str = format_triggers(cto_triggers[current_skill_id])
                # Need to add proper indentation - find the base indent
                indent_match = re.match(r'^(\s*)', line)
                base_indent = indent_match.group(1) if indent_match else '      '
                # The triggers should be at the same level as other properties
                trigger_lines = triggers_str.split('\n')
                for tl in trigger_lines:
                    new_lines.append(base_indent + tl)
                current_skill_id = None
                collecting_skill = False
        
        new_lines.append(line)
        i += 1
    
    return '\n'.join(new_lines)

def add_triggers_to_sports(content):
    """Add triggers to Sports skills and fix the first skill ID"""
    lines = content.split('\n')
    new_lines = []
    i = 0
    in_skills = False
    brace_count = 0
    current_skill_id = None
    collecting_skill = False
    first_skill_fixed = False
    
    while i < len(lines):
        line = lines[i]
        
        # Track array contexts
        if 'const SPORTS_SKILLS: Tool[] = [' in line:
            in_skills = True
        if 'const SPORTS_EXTERNAL_SKILLS: Tool[] = [' in line:
            in_skills = True  # Still in skills array
        
        # Fix the first skill ID and name
        if not first_skill_fixed and 'id: \'createCodeSkill\'' in line:
            line = line.replace('id: \'createCodeSkill\'', 'id: \'analyze-matchup\'')
            first_skill_fixed = True
        if not first_skill_fixed and 'name: \'Create Code Skill\'' in line:
            line = line.replace('name: \'Create Code Skill\'', 'name: \'Analyze Matchup\'')
            first_skill_fixed = True
        
        # Detect skill ID (after potential fix)
        id_match = re.search(r"id:\s*[\'\"]([^\'\"]+)[\'\"]", line)
        if id_match and in_skills:
            current_skill_id = id_match.group(1)
            skill_brace_count = 0
            collecting_skill = True
        
        # Count braces in skill object
        if collecting_skill:
            skill_brace_count += line.count('{')
            skill_brace_count -= line.count('}')
            
            # When brace count returns to 0, we've closed the skill object
            if skill_brace_count == 0 and current_skill_id in sports_triggers:
                # Insert triggers before this closing line
                triggers_str = format_triggers(sports_triggers[current_skill_id])
                indent_match = re.match(r'^(\s*)', line)
                base_indent = indent_match.group(1) if indent_match else '      '
                trigger_lines = triggers_str.split('\n')
                for tl in trigger_lines:
                    new_lines.append(base_indent + tl)
                current_skill_id = None
                collecting_skill = False
        
        new_lines.append(line)
        i += 1
    
    return '\n'.join(new_lines)

# ============================================================
# MAIN
# ============================================================

# Process CTO file
cto_path = '/mnt/1tbHD/ckt_web/stage7/services/tool-executor/src/data/skills/cto/index.ts'
with open(cto_path, 'r') as f:
    cto_content = f.read()

print("Processing CTO file...")
new_cto_content = add_triggers_to_cto(cto_content)

with open(cto_path, 'w') as f:
    f.write(new_cto_content)
print("CTO file updated.")

# Process Sports file
sports_path = '/mnt/1tbHD/ckt_web/stage7/services/tool-executor/src/data/skills/sports/index.ts'
with open(sports_path, 'r') as f:
    sports_content = f.read()

print("Processing Sports file...")
new_sports_content = add_triggers_to_sports(sports_content)

with open(sports_path, 'w') as f:
    f.write(new_sports_content)
print("Sports file updated.")

print("Done!")
