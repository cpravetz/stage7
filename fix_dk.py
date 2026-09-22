#!/usr/bin/env python3
"""
Script to replace "Same as above" entries in Domain Knowledge, Persistent Data,
and Interfaces columns with actual values from the design document.
"""

import re

# Domain Knowledge mapping
DOMAIN_KNOWLEDGE = {
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

# Persistent Data mapping
PERSISTENT_DATA = {
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

# Interfaces mapping
INTERFACES = {
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

def fix_file(input_path, output_path):
    with open(input_path, 'r') as f:
        content = f.read()
    
    lines = content.split('\n')
    current_assistant = None
    replacements = {
        'domain_knowledge': 0,
        'persistent_data': 0,
        'interfaces': 0
    }
    
    # Pattern to detect assistant section headers: ## N. Name
    section_pattern = re.compile(r'^##\s+(\d+)\.\s+')
    
    # We need to parse the table rows. The format is:
    # | ID | Description | ... | Domain Knowledge | Persistent Data | Interfaces | Design |
    # We'll process line by line, tracking which assistant we're in
    
    output_lines = []
    in_table = False
    header_seen = False
    
    for line in lines:
        # Check for section header
        section_match = section_pattern.match(line)
        if section_match:
            current_assistant = int(section_match.group(1))
            in_table = False
            header_seen = False
        
        # Check for table header row
        if '| Domain Knowledge | Persistent Data | Interfaces |' in line:
            header_seen = True
            in_table = True
            output_lines.append(line)
            continue
        
        # Check for table separator row
        if in_table and line.strip().startswith('|---'):
            output_lines.append(line)
            continue
        
        # Process table data rows
        if in_table and line.strip().startswith('| ') and '|' in line:
            # Parse the row
            parts = line.split('|')
            # parts[0] is empty, parts[1] is ID, parts[2] Description, etc.
            # Domain Knowledge is at index 8 (9th column), Persistent Data at 9, Interfaces at 10
            if len(parts) >= 11:
                # Domain Knowledge column (index 8)
                dk_col = parts[8].strip()
                if dk_col == "Same as above" and current_assistant in DOMAIN_KNOWLEDGE:
                    parts[8] = f" {DOMAIN_KNOWLEDGE[current_assistant]} "
                    replacements['domain_knowledge'] += 1
                
                # Persistent Data column (index 9)
                pd_col = parts[9].strip()
                if pd_col == "Same as above" and current_assistant in PERSISTENT_DATA:
                    parts[9] = f" {PERSISTENT_DATA[current_assistant]} "
                    replacements['persistent_data'] += 1
                
                # Interfaces column (index 10)
                if_col = parts[10].strip()
                if if_col == "Same as above" and current_assistant in INTERFACES:
                    parts[10] = f" {INTERFACES[current_assistant]} "
                    replacements['interfaces'] += 1
                
                line = '|'.join(parts)
        
        # Check for end of table (blank line or next section)
        if in_table and line.strip() == '' and header_seen:
            # Could be end of table, but let's be careful
            pass
        
        output_lines.append(line)
    
    # Write output
    with open(output_path, 'w') as f:
        f.write('\n'.join(output_lines))
    
    return replacements

if __name__ == '__main__':
    input_file = '/mnt/1tbHD/ckt_web/stage7/docs/assistants design 0921.md'
    output_file = '/mnt/1tbHD/ckt_web/stage7/docs/assistants design 0921.md'
    
    replacements = fix_file(input_file, output_file)
    
    print(f"Replacements made:")
    print(f"  Domain Knowledge: {replacements['domain_knowledge']}")
    print(f"  Persistent Data: {replacements['persistent_data']}")
    print(f"  Interfaces: {replacements['interfaces']}")
    print(f"  Total: {sum(replacements.values())}")
