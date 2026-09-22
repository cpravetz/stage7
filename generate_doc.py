#!/usr/bin/env python3
"""
Generates the assistants design markdown document.
"""

from pathlib import Path
from typing import TypedDict


class Skill(TypedDict):
    id: str
    description: str
    triggers: str
    inputs: str
    config: str
    consumes: str
    produces: str
    domain_knowledge: str
    persistent_data: str
    interfaces: str
    design_note: str


class Assistant(TypedDict):
    name: str
    workflow: str
    skills: list[Skill]


def render_skill_table(skills: list[Skill]) -> str:
    """Render skills as a markdown table."""
    if not skills:
        return ""
    
    headers = [
        "ID", "Description", "Triggers", "Inputs", "Config",
        "Consumes", "Produces", "Domain Knowledge",
        "Persistent Data", "Interfaces", "Design Note"
    ]
    
    lines = []
    lines.append("| " + " | ".join(headers) + " |")
    lines.append("| " + " | ".join(["---"] * len(headers)) + " |")
    
    for skill in skills:
        row = [
            skill["id"],
            skill["description"],
            skill["triggers"],
            skill["inputs"],
            skill["config"],
            skill["consumes"],
            skill["produces"],
            skill["domain_knowledge"],
            skill["persistent_data"],
            skill["interfaces"],
            skill["design_note"],
        ]
        lines.append("| " + " | ".join(row) + " |")
    
    return "\n".join(lines)


def render_assistant(assistant: Assistant, number: int) -> str:
    """Render a single assistant section."""
    lines = []
    lines.append(f"## {number}. {assistant['name']}")
    lines.append("")
    lines.append(f"**Workflow:** {assistant['workflow']}")
    lines.append("")
    lines.append("### Skills")
    lines.append("")
    lines.append(render_skill_table(assistant["skills"]))
    lines.append("")
    return "\n".join(lines)


def main():
    output_path = Path("/mnt/1tbHD/ckt_web/stage7/docs/assistants design 0921.md")
    
    assistants: list[Assistant] = [
        {
            "name": "CTO",
            "workflow": "Strategic Vision → Architecture Decisions → Technical Roadmap → Governance → Delivery Oversight",
            "skills": [
                {
                    "id": "CTO-001",
                    "description": "Define and communicate technical vision aligned with business strategy",
                    "triggers": "Quarterly planning, major initiative kickoff, market shifts",
                    "inputs": "Business goals, market analysis, current architecture state",
                    "config": "Vision horizon (quarters), risk tolerance, innovation budget %",
                    "consumes": "Business strategy docs, competitive analysis, tech radar",
                    "produces": "Technical vision doc, architecture principles, investment thesis",
                    "domain_knowledge": "Enterprise architecture, technology lifecycle management, capital allocation",
                    "persistent_data": "Vision artifacts, decision logs, architecture decision records (ADRs)",
                    "interfaces": "Board/exec presentations, architecture review board, strategy docs",
                    "design_note": "Single owner of technical vision; delegates execution to VPs/leads"
                },
                {
                    "id": "CTO-002",
                    "description": "Make high-impact architecture decisions with long-term implications",
                    "triggers": "New platform choice, major refactor, vendor selection, scale inflection",
                    "inputs": "RFCs, trade-off analyses, cost models, team capacity",
                    "config": "Decision framework (RACI), reversibility threshold, stakeholder quorum",
                    "consumes": "Engineering RFCs, vendor evals, security reviews, cost projections",
                    "produces": "Architecture Decision Records (ADRs), approved patterns, standards",
                    "domain_knowledge": "Distributed systems, cloud economics, vendor lock-in patterns, technical debt quantification",
                    "persistent_data": "ADR registry, approved tech stack, deprecated list, exception log",
                    "interfaces": "Architecture review board, engineering leads, security, finance",
                    "design_note": "Decisions recorded as ADRs; reversible decisions delegated, irreversible escalated"
                },
                {
                    "id": "CTO-003",
                    "description": "Own technical roadmap balancing innovation, reliability, and debt reduction",
                    "triggers": "Annual planning, quarterly reviews, incident postmortems, capacity crunch",
                    "inputs": "Team roadmaps, incident data, debt inventory, hiring plan",
                    "config": "Innovation ratio (e.g., 70/20/10), debt paydown velocity target",
                    "consumes": "Team plans, reliability metrics, debt assessments, hiring forecast",
                    "produces": "Consolidated roadmap, resource allocation, priority rankings",
                    "domain_knowledge": "Portfolio management, capacity planning, risk-weighted prioritization",
                    "persistent_data": "Roadmap versions, allocation history, priority changes log",
                    "interfaces": "Engineering directors, product management, finance, people ops",
                    "design_note": "Roadmap is a living document; quarterly recommitment with escape hatches"
                },
                {
                    "id": "CTO-004",
                    "description": "Establish and enforce engineering standards and governance",
                    "triggers": "New team formation, audit findings, compliance requirements, quality regression",
                    "inputs": "Current practices, industry benchmarks, regulatory requirements",
                    "config": "Standard tiers (mandatory/recommended/experimental), exception process",
                    "consumes": "Audit reports, incident trends, compliance checklists, team feedback",
                    "produces": "Engineering handbook, coding standards, review checklists, SLIs/SLOs",
                    "domain_knowledge": "Software quality models, compliance frameworks (SOC2, ISO), DevOps maturity models",
                    "persistent_data": "Standards registry, compliance evidence, exception tracker, maturity scores",
                    "interfaces": "Engineering managers, security, legal, auditors, platform teams",
                    "design_note": "Standards as enablers not gatekeepers; automated enforcement where possible"
                },
                {
                    "id": "CTO-005",
                    "description": "Oversee delivery health and intervene on systemic risks",
                    "triggers": "Missed milestones, quality escapes, burnout signals, dependency conflicts",
                    "inputs": "Delivery metrics, team health surveys, dependency graph, risk register",
                    "config": "Escalation thresholds, intervention playbooks, recovery time targets",
                    "consumes": "Sprint reports, DORA metrics, retrospectives, risk assessments",
                    "produces": "Intervention decisions, resource reallocations, process improvements",
                    "domain_knowledge": "Delivery metrics (DORA, SPACE), team dynamics, systemic risk patterns",
                    "persistent_data": "Health dashboards, intervention log, recovery tracking",
                    "interfaces": "Engineering directors, program management, people ops",
                    "design_note": "Intervene on patterns not exceptions; empower teams to self-correct first"
                }
            ]
        }
    ]
    
    # Build markdown
    lines = []
    lines.append("# Assistants Design Document")
    lines.append("")
    lines.append("*Generated on 2026-09-21*")
    lines.append("")
    lines.append("---")
    lines.append("")
    
    for i, assistant in enumerate(assistants, 1):
        lines.append(render_assistant(assistant, i))
    
    content = "\n".join(lines)
    output_path.write_text(content)
    print(f"Generated: {output_path}")
    print(f"Lines: {len(content.splitlines())}")


if __name__ == "__main__":
    main()
