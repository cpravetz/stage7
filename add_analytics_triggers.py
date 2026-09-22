from pathlib import Path
import json
import re
import sys

FILE = Path("/mnt/1tbHD/ckt_web/stage7/services/tool-executor/src/data/skills/analytics/index.ts")
SKILLS = {
    "analytics_business_insight_report": {
        "user": ["Analyze metric", "Run report", "Check trends"],
        "schedule": ["Daily metrics digest", "Weekly insight report", "Monthly stakeholder summary"],
        "event": ["Report generated", "Anomaly detected", "New data available"],
        "data": ["Metric anomaly detected", "Trend breaks pattern", "Z-score exceeds threshold"],
    },
    "analytics_warehouse_query": {
        "user": ["Query warehouse", "Run SQL", "Check data"],
        "schedule": ["Weekly warehouse sync", "Monthly data quality review"],
        "event": ["Credentials registered", "Query executed", "Data refreshed"],
        "data": ["Query timeout", "Result size exceeds limit"],
    },
}

def quoted(value):
    return json.dumps(value, ensure_ascii=False)


def trigger_block(indent, values):
    lines = [f"{indent}triggers: ["]
    lines.append(
        f"{indent}  {{ kind: 'user', phrase_examples: [{', '.join(quoted(v) for v in values['user'])}] }},"
    )
    for value in values["schedule"]:
        lines.append(f"{indent}  {{ kind: 'schedule', cadence: {quoted(value)} }},")
    for value in values["event"]:
        lines.append(f"{indent}  {{ kind: 'event', on: {quoted(value)} }},")
    for value in values["data"]:
        lines.append(f"{indent}  {{ kind: 'data', condition: {quoted(value)} }},")
    lines[-1] = lines[-1].rstrip()
    lines.append(f"{indent}],")
    return "\n".join(lines)


def find_id(lines, skill_id):
    pattern = re.compile(r"^\s*id:\s*['\"]" + re.escape(skill_id) + r"['\"]")
    for index, line in enumerate(lines):
        if pattern.search(line):
            return index
    raise RuntimeError(f"Could not find skill id {skill_id}")


def find_factory_bounds(lines, id_index):
    start = None
    for index in range(id_index - 1, -1, -1):
        if re.search(r"(?:createCodeSkill|createExternalActionSkill)\s*\(\s*\{", lines[index]):
            start = index
            break
    if start is None:
        raise RuntimeError("Could not find factory start")
    end = None
    for index in range(id_index + 1, len(lines)):
        if re.match(r"^\}\);", lines[index]):
            end = index
            break
    if end is None:
        raise RuntimeError("Could not find factory end")
    return start, end


def find_anchor(lines, start, end):
    for index in range(start + 1, end):
        if re.match(r"^\s*(?:createdAt|timeoutMs):", lines[index]):
            return index
    return end


def remove_existing(lines, start, end):
    for index in range(start, end):
        if not re.match(r"^\s*triggers:\s*\[", lines[index]):
            continue
        depth = 0
        cursor = index
        while cursor < end:
            depth += lines[cursor].count("[") - lines[cursor].count("]")
            if depth == 0 and "]" in lines[cursor]:
                return index, cursor + 1
            cursor += 1
        raise RuntimeError("Could not find existing triggers array")
    return None


def apply(lines, skill_id, values):
    id_index = find_id(lines, skill_id)
    factory_start, factory_end = find_factory_bounds(lines, id_index)
    anchor = find_anchor(lines, factory_start, factory_end)
    existing = remove_existing(lines, factory_start, factory_end)
    anchor_indent = re.match(r"^\s*", lines[anchor]).group(0)
    property_anchor = bool(re.match(r"^\s*(?:createdAt|timeoutMs):", lines[anchor]))
    indent = anchor_indent if property_anchor else anchor_indent + "  "
    block = trigger_block(indent, values)
    if existing:
        lines[existing[0]:existing[1]] = block.splitlines()
        if property_anchor:
            anchor = next(index for index in range(id_index + 1, len(lines)) if re.match(r"^\s*(?:createdAt|timeoutMs):", lines[index]))
        else:
            anchor = next(index for index in range(id_index + 1, len(lines)) if re.match(r"^\}\);", lines[index]))
        while anchor > 0 and lines[anchor - 1] == "":
            del lines[anchor - 1]
            anchor -= 1
    else:
        lines[anchor:anchor] = block.splitlines()


def main():
    text = FILE.read_text()
    lines = text.splitlines()
    for skill_id, values in SKILLS.items():
        apply(lines, skill_id, values)
    updated = "\n".join(lines) + "\n"
    if "triggers: {" in updated:
        raise RuntimeError("Validation failed: found 'triggers: {' (object format); expected SkillTrigger[] array format")
    if "triggers: [" not in updated:
        raise RuntimeError("Validation failed: 'triggers: [' not found; expected SkillTrigger[] array format")
    print("Validation passed: triggers are in SkillTrigger[] array format")
    if updated == text:
        count = updated.count("triggers:")
        if count != len(SKILLS):
            raise RuntimeError(f"Expected {len(SKILLS)} triggers occurrences, found {count}")
        print(f"Already up to date: {FILE} ({count} trigger arrays)")
        return
    FILE.write_text(updated)
    count = updated.count("triggers:")
    if count != len(SKILLS):
        raise RuntimeError(f"Expected {len(SKILLS)} triggers occurrences, found {count}")
    print(f"Updated {FILE}: {count} trigger arrays")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise
