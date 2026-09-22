#!/usr/bin/env python3
from pathlib import Path
import re

DOCUMENT_PATH = Path("/mnt/1tbHD/ckt_web/stage7/docs/assistants design 0921.md")
SECTION_RE = re.compile(r"^##\s+(\d+)\.\s+", re.MULTILINE)

dk = {
    1: "Distributed systems architecture, DevOps/SRE, DORA metrics, cloud cost optimization, microservices failure modes",
    2: "Hiring processes, compensation structuring (equity, bonuses, base), ATS parsing logic, personal branding, negotiation tactics",
    3: "Executive coaching, corporate governance, organizational psychology, high-stakes communication, change management",
    4: "Contract law, commercial negotiation standards, regulatory compliance (GDPR, SOC2, HIPAA), legal/security liability mitigation",
    5: "B2B sales methodologies (MEDDPICC, Challenger), outbound messaging optimization, CRM hygiene standards, pipeline forecasting",
    6: "Event logistics management, catering operations (BEOs), vendor contract structures, spatial design principles, crowd management timing",
    7: "Hospitality metrics (Prime Cost, RevPASH), kitchen operational workflows, food inventory management, reservation flow management, health code baselines",
    8: "SEO content architectures, search engine algorithms, content marketing conversion funnels, editorial style guides (AP, Chicago)",
    9: "Music theory, prosody rules, songwriting structural frameworks (AABA, Verse-Chorus-Bridge), lyric metrics and stress analysis",
    10: "Screenwriting standards (Final Draft/Fountain format), narrative theory (Save the Cat, Hero's Journey), dialogue subtext principles, film/TV pacing",
    11: "Advanced sports analytics (xG, PER, EPA), bankroll management mathematics, implied probability, line movement analysis",
    12: "Corporate finance principles, US GAAP/IFRS standards, financial modeling, capital allocation strategies",
    13: "Modern Portfolio Theory (MPT), tax-efficient withdrawal strategies, personal cash flow management, asset location rules",
    14: "Practice management workflows, evidence-based clinical guidelines, HIPAA compliance rules, medical billing/coding cycles",
    15: "Hotel metrics (ADR, RevPAR, GOPPAR), PMS operations, guest service standards, yield management, hotel maintenance triage",
    16: "Pedagogical frameworks (Bloom's Taxonomy, Spaced Repetition), curriculum design, assessment scoring methods, student engagement metrics",
    17: "Customer success metrics (CSAT, NPS, Churn Rate), SLA management, support escalation tiers, ticket triage",
    18: "Talent acquisition lifecycles, structured interview methodology, compensation benchmarking, employment law compliance (EEOC)",
    19: "Product management frameworks (RICE, WSJF, Jobs-to-be-Done), Agile/Scrum methodologies, user telemetry interpretation",
    20: "Performance marketing dynamics, multi-touch attribution, copywriting frameworks (AIDA, PAS), conversion rate optimization (CRO)",
    21: "Business intelligence architectures, SQL/data modeling principles, statistical trend analysis, cross-functional KPI frameworks",
}

persistent_data = {
    1: "Architecture diagrams/specifications, cloud budget thresholds, target SLO/SLA definitions, team capacity matrices, tech debt backlog",
    2: "Master Career Profile (resume.json), target role criteria, compensation floors, application history log, company exclusion list",
    3: "Executive Goal Matrix, Stakeholder Maps, Leadership Values & Communication Style Guide, Board Governance Calendar",
    4: "Standard Playbook & Clause Library, Organizational Risk & Security Thresholds, Active Matter Directory, Historical Contract Archives",
    5: "Ideal Customer Profile (ICP) definitions, Product Value Frameworks, Target Account Lists, Historical Deal Stages, Objection-Handling Matrices",
    6: "Master Event Specs, Budget Ledger, Vendor Directory & Rating History, Guest List & Dietary Matrix, Seating Models",
    7: "Master Recipe & Ingredient Catalog, Inventory Stock Levels, Vendor Price Lists, POS Sales History, Guest CRM & VIP Profiles, Labor Schedule Rules",
    8: "Content Style Guide, SEO Keyword Map, Publishing Schedule, Channel Performance Analytics",
    9: "Lyric Sketchbook, Genre Style Bibles, Song Idea Archive, Copyright/Registration Records",
    10: "Screenplay Drafts, Character Bibles, World/Setting Guides, Scene Breakdown Logs",
    11: "Group A: Roster Telemetry, Scouting Archives, Tactical Playbooks. Group B: User Bankroll Rules, Unit Limits, Line Alert Specs. No cross-feeding.",
    12: "General Ledger Records, Chart of Accounts, Operating Budget Models, Historical BVA Data, Board Reporting Templates",
    13: "Personal Net Worth Ledger, Asset Allocation Targets, Recurring Expense Rules, Tax Profile, Personal Financial Goals",
    14: "Practice Operational Templates, Patient Communication Rules, Provider Schedule Models, Evidence-Based Clinical Guidelines",
    15: "Property Management System (PMS) Records, Guest Profiles & Preferences, Local Concierge Directory, Maintenance Log, Amenity Inventory",
    16: "Curriculum Standards & Rubrics, Student Performance History, Knowledge Gap Maps, Course Material Libraries",
    17: "Product Knowledge Base, Account Health Profiles, Support Escalation Protocols, Historical Ticket Log",
    18: "Organizational Chart, Job Description Library, Compensation Band Benchmarks, Candidate Pipeline Records",
    19: "Product Vision & Strategy Docs, Feature Backlog, User Persona Models, Competitor Capability Matrix",
    20: "Brand Positioning Guidelines, Target Audience Personas, Channel Performance Benchmarks, Campaign Asset Repository, Ad Spend Budgets",
    21: "Data Warehouse Schema Mappings, Metric Definitions & KPI Dictionary, Historical Query Cache",
}

interfaces = {
    1: "AWS/GCP/Azure APIs, Datadog/PagerDuty, GitHub/GitLab, Jira/Linear, Slack/Teams",
    2: "Job Boards (LinkedIn, Indeed, Glassdoor), ATS Systems (Lever, Greenhouse), Email SMTP/IMAP, PDF Generation Engines",
    3: "Executive Calendar APIs, Email, Board Management Portals, Communication Platforms",
    4: "Legal Research APIs, Document Management Systems (Google Drive, SharePoint), E-Signature Platforms (PandaDoc, DocuSign), Compliance/Security Logs",
    5: "CRM Systems (Salesforce, HubSpot), Sales Engagement APIs (Outreach, Apollo), Enrichment Data (ZoomInfo, Clearbit), Calendar Systems",
    6: "Ticketing/RSVP Platforms (Eventbrite, Luma), Payment Gateways (Stripe), Messaging Platforms (Twilio, Email), Floor Plan Tools",
    7: "POS Systems (Toast, Square), Reservation Engines (OpenTable, Resy), Inventory Platforms (Restaurant365, MarketMan), Supplier Ordering Portals (Sysco, US Foods)",
    8: "CMS Platforms (WordPress, Ghost, Medium), SEO Tools (Ahrefs, Semrush), Analytics (Google Analytics 4)",
    9: "Digital Audio Workstation (DAW) metadata tools, Lead Sheet PDF export tools, Copyright registration portals",
    10: "Scriptwriting Software Formats (Fountain, Final Draft), Pitch Deck Platforms",
    11: "Group A: Sports Data APIs (StatsPerform, Opta), Wearable Telemetry. Group B: Odds Data APIs. No Sportsbook Account APIs.",
    12: "Accounting ERPs (NetSuite, QuickBooks, Xero), Banking APIs, Financial Modeling Engines",
    13: "Personal Financial Aggregators (Plaid), Brokerage APIs (Alpaca, Interactive Brokers), Bank Feeds",
    14: "EHR/EMR Platforms (Epic, AthenaHealth), Telehealth Gateways, Secure HIPAA-Compliant SMS/Email Gateways",
    15: "Property Management Systems (Opera, Cloudbeds), Maintenance Tracking Tools, Channel Managers, Guest Messaging Systems",
    16: "Learning Management Systems (Canvas, Blackboard, Moodle), Assessment Platforms, Student Information Systems (SIS)",
    17: "Helpdesk Platforms (Zendesk, Intercom, Freshdesk), Product Analytics (Mixpanel, Amplitude), CRM Systems",
    18: "Applicant Tracking Systems (Greenhouse, Lever), HRIS Systems (Rippling, BambooHR), Calendar APIs",
    19: "Project Management Tools (Jira, Linear), Product Analytics (Mixpanel, Pendo), Feedback Systems (Canny, UserVoice), Documentation (Confluence, Notion)",
    20: "Ad Platforms (Meta Ads, Google Ads), Marketing Automation (HubSpot, Marketo), Analytics (GA4), PR Distribution Networks (if media fallback used)",
    21: "Data Warehouses (Snowflake, BigQuery), BI Tools (Looker, Tableau, Metabase)",
}

COLUMN_VALUES = {
    8: dk,
    9: persistent_data,
    10: interfaces,
}


def split_line_ending(line):
    if line.endswith("\n"):
        if line.endswith("\r\n"):
            return line[:-2], "\r\n"
        return line[:-1], "\n"
    return line, ""


def replace_cells(content):
    lines = content.splitlines(keepends=True)
    current_assistant = None
    replacements = {8: 0, 9: 0, 10: 0}
    processed_rows = 0

    for line_index, original_line in enumerate(lines):
        line_body, line_ending = split_line_ending(original_line)
        section_match = SECTION_RE.match(line_body)
        if section_match:
            current_assistant = int(section_match.group(1))
            lines[line_index] = original_line
            continue

        if current_assistant is None or not line_body.startswith("| "):
            lines[line_index] = original_line
            continue
        if line_body.startswith("|---") or "Domain Knowledge" in line_body:
            lines[line_index] = original_line
            continue

        parts = line_body.split("|")
        if len(parts) < 12:
            lines[line_index] = original_line
            continue

        processed_rows += 1
        for column, values in COLUMN_VALUES.items():
            expected = values[current_assistant]
            if parts[column].strip() != expected:
                replacements[column] += 1
            parts[column] = f" {expected} "
        lines[line_index] = "|".join(parts) + line_ending

    return "".join(lines), replacements, processed_rows


def validate(content, processed_rows):
    headers = [int(match) for match in SECTION_RE.findall(content)]
    if headers != list(range(1, 22)):
        raise RuntimeError(f"Expected assistant headers 1-21, found {headers}")
    if "Same as above" in content:
        raise RuntimeError("Same as above remains in the document")
    if processed_rows == 0:
        raise RuntimeError("No assistant table rows were processed")

    current_assistant = None
    checked_rows = 0
    for line in content.splitlines():
        section_match = SECTION_RE.match(line)
        if section_match:
            current_assistant = int(section_match.group(1))
            continue
        if current_assistant is None or not line.startswith("| "):
            continue
        if line.startswith("|---") or "Domain Knowledge" in line:
            continue
        parts = line.split("|")
        if len(parts) < 12:
            continue
        for column, values in COLUMN_VALUES.items():
            if parts[column].strip() != values[current_assistant]:
                raise RuntimeError(
                    f"Assistant {current_assistant} column {column} is not exact"
                )
        checked_rows += 1

    if checked_rows != processed_rows:
        raise RuntimeError(
            f"Processed {processed_rows} rows but validated {checked_rows} rows"
        )


def main():
    content = DOCUMENT_PATH.read_text()
    updated, replacements, processed_rows = replace_cells(content)
    validate(updated, processed_rows)
    DOCUMENT_PATH.write_text(updated)
    print(f"Document: {DOCUMENT_PATH}")
    print(f"Assistant headers: 21")
    print(f"Rows processed: {processed_rows}")
    print(f"Domain Knowledge replacements: {replacements[8]}")
    print(f"Persistent Data replacements: {replacements[9]}")
    print(f"Interfaces replacements: {replacements[10]}")
    print(f"Total replacements: {sum(replacements.values())}")
    print("Same as above remaining: 0")


if __name__ == "__main__":
    main()
