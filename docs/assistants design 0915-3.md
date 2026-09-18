# Assistant Taxonomy v2 

---

## Cross-cutting principles (apply to every assistant below)

1. **Advise / Aid / Represent are categories, not a skill quota.** The original intent
   was never "exactly three skills per assistant" — it's that every skill an assistant
   has should map onto one of these three functions. A domain that genuinely needs two
   Advise skills and one Represent skill should have that; forcing a third just to fill
   the category would be the wrong kind of consistency. Several entries below have more
   than three skills total for this reason — that's intended, not a deviation.

2. **The honest not-connected contract is mandatory on every Advise or Represent skill
   that depends on an external interface.** If the interface isn't configured, the
   skill must say so plainly — never fabricate a success or return a well-formed empty
   result that looks like a real answer. This was the specific failure caught in the
   Education assistant's Learner Insight skill and must not recur anywhere in this list.

3. **Represent skills split into two governance tiers, and each one below is labeled
   accordingly:**
   - **One-shot, confirm-before-send** (default): a single action, staged and shown to
     the user, executed only on explicit approval. Most Represent skills are this.
   - **Ongoing delegated authority**: ongoing action over time without a
     confirmation per instance — e.g. a multi-touch outreach sequence, a scheduled
     monitoring-and-alert loop. These need their own explicit sub-spec: what pauses it,
     what's the kill switch, does it re-request approval after N actions or only once
     at setup, what's logged. Nowhere below should this tier be implied without that
     sub-spec being present.

4. **Assistants don't merge audiences without a stated reason.** Business tools stay
   separate from personal/consumer tools. Serious, regulated-adjacent tools stay
   separate from entertainment/demonstration tools. Professional-practitioner tools stay
   separate from job-seeker/individual tools. Where the original 24-assistant draft
   crossed one of these lines, it's un-merged below with the reasoning stated.

5. **Reconciliation is explicit, not silent.** Several of these assistants overlap
   prior work: `career-coach-v2`, `cto-v2`, and `restaurant-v2` (fully implemented
   reference code), the 19-category `cross-assistant-redesign.md`, and the per-assistant
   appendices in `skill-design-framework.md`. Every entry below that touches prior work
   states its relationship to it explicitly — supersedes, merges into, or coexists with.
   Nothing here should be read as silently dropping capability that existed before.

6. **Higher-order skill requirement and mapping to lower-order tools.** For every assistant — and especially domain-rich assistants such as the Career Coach — the specification must enumerate outcome-shaped, higher-order skills (for example: Job Discovery & Fit Ranking; Application Execution / Auto-Apply; Interview Preparation; Pipeline Reporting). Each higher-order skill MUST explicitly reference one or more existing lower-order tool IDs or implementations present in the codebase (for example: `career_job_discovery`, `career_rank`, `career_apply_execute`, `career_interview_prep`, `career_outcome`, `career_notion_sync`, `career_gmail_sync`) or provide a canonical wrapper that delegates to those lower-level tools. When a higher-order skill depends on external connectors or MCP integrations it must (a) include an honest `not-connected` fallback, (b) declare required connector configuration in a `configSchema`, and (c) document which lower-order tools produce or consume the shared workspace artifacts that the skill relies on.

---


### 1. CTO & Engineering Leadership Assistant

* **Higher-Order Skills:**
* **Advise — Architecture & Tech Debt Evaluator:** Analyzes system health, software architecture patterns, and technical debt trade-offs to produce prioritized modernization roadmaps.


* **Advise — Cloud Spend & Infrastructure Optimizer:** Evaluates cloud billing trends, resource utilization metrics, and anomaly flags to recommend concrete cost-reduction measures.


* **Aid — Incident War Room Synthesizer:** Aggregates real-time telemetry, error logs, and recent code deployments to generate root-cause hypotheses, mitigation checklists, and stakeholder updates during outages.


* **Represent — Engineering Action & IaC Drift Remediation:** Drafts, dry-runs, and (upon confirmation) submits pull requests, dispatches deployment rollbacks, or applies infrastructure-as-code adjustments.


* **[restores] Advise — Team Delivery & Engineering Health Evaluator:** DORA metrics, team capacity, and sprint velocity analysis for engineering leadership decisions. Restored from earlier cto-v2 design; underlying tools `calculate_dora_metrics()` and team capacity data already exist.

* **[restores] Aid/Represent — Disaster Recovery & Incident Readiness Planner:** Present in the earlier cto-v2 design as its own skill grounded in real incident history. Uses `cto-incident-disaster-readiness` tool. Restored from cto-v2.

* **Tools Needed:** `get_cloud_billing_metrics()`, `query_datadog_alerts()`, `fetch_github_pull_requests()`, `fetch_jira_backlog()`, `calculate_dora_metrics()`, `execute_iac_drift_scan()`.
* **Reasoning Needed:** Trade-off analysis between immediate velocity and technical debt; root-cause correlation across log streams; risk assessment of auto-remediation PRs.
* **Persistent Data Categories:** Architecture diagrams/specifications, cloud budget thresholds, target SLO/SLA definitions, team capacity matrices, tech debt backlog.
* **Triggers:** Scheduled (weekly tech debt/DORA digest); Data-Driven (cloud billing anomaly, PagerDuty alert); Event-Driven (vulnerability scan alert on main branch).
* **Interfaces:** AWS/GCP/Azure APIs, Datadog/PagerDuty, GitHub/GitLab, Jira/Linear, Slack/Teams.
* **UX Needs:** Architecture decision records (ADRs), cost breakdown tables, incident timelines, GitHub PR preview diffs.
* **Domain Knowledge:** Distributed systems architecture, DevOps/SRE, DORA metrics, cloud cost optimization, microservices failure modes.

---

### 2. Career Coach & Job Search Assistant

* **Higher-Order Skills:**
* **Advise — Job Market Positioning Evaluator:** Evaluates candidate credentials against market trends, target compensation, and role specifications to define a job search strategy and prioritize target opportunities (consumes `parse_resume_json()`, `match_skill_matrix()`).
* **Advise — Job Discovery & Fit Ranking:** Continuously discovers roles across boards, scrapes listings, scores fit and ATS compatibility, and ranks opportunities by match quality and priority (maps to `career_job_discovery`, `career_rank`).
* **Aid — Interview & Compensation Battlecard Creator:** Generates tailored interview Q&A frameworks, company-specific briefing decks, negotiation playbooks, and exportable battlecards for mock interviews (consumes `career_interview_prep`, `format_markdown_pdf()`).
* **Aid — Upskill & Role-Targeted Learning Planner:** Recommends concise upskilling plans, curated learning resources, and micro-practice tasks aligned to target roles to close key gaps identified in match scoring.
* **Represent — Governed Application & Outreach Manager:** Customizes resumes and cover letters, drafts outreach messages, stages confirm-before-send submissions, and records audit logs for each outreach action (integrates with `career_apply_execute`, `draft_email_payload()`).
* **Represent — Application Execution / Orchestrator (Auto-Apply):** Orchestrates multi-portal application submission workflows with dry-run, confirm-before-send, and explicit audit trails; selects resume variants, applies templates, and formats output as part of the auto-apply pipeline; provides an honest `not-connected` fallback and requires declared `configSchema` for portal connectors (wraps `career_apply_execute`, `career_add_portal`).
* **Represent — Interview Practice & Mock Interviewer:** Runs interactive mock interviews using role/company battlecards, records performance, and produces actionable coaching notes and follow-up practice tasks (uses `career_interview_prep`, battlecard outputs).
* **Advise / Report — Pipeline & Outcome Tracker:** Tracks application statuses, captures outcomes and feedback, and generates pipeline reports, HTML/ATS-friendly summaries, and exportable reports for downstream analysis (maps to `career_outcome`, `format_markdown_pdf()`).
* **Represent — Portal Integration & Recruiter Workflow:** Manages portal credential registration (`add-portal`), confirm-before-send submission flows, recruiter outreach sequencing, and documents which lower-order tools are used at each step.


* **Tools Needed:** `parse_resume_json()`, `scrape_job_boards()`, `match_skill_matrix()`, `format_markdown_pdf()`, `draft_email_payload()`.
* **Reasoning Needed:** Alignment between candidate history and job specs; tone crafting for outreach; negotiation positioning.
* **Persistent Data Categories:** Master Career Profile (`resume.json`), target role criteria, compensation floors, application history log, company exclusion list.
* **Triggers:** Scheduled (daily target job discovery digest); Event-Driven (inbound recruiter message, application status update).
* **Interfaces:** Job Boards (LinkedIn, Indeed, Glassdoor), ATS Systems (Lever, Greenhouse), Email SMTP/IMAP, PDF Generation Engines.
* **UX Needs:** Side-by-side job fit match tables, customizable interview preparation cards, "Confirm-Before-Send" outreach submission modals.
* **Domain Knowledge:** Hiring processes, compensation structuring (equity, bonuses, base), ATS parsing logic, personal branding, negotiation tactics.

---

### 3. Executive Leadership & Development Assistant

* **Higher-Order Skills:**
* **Advise — Executive Presence & Stakeholder Strategy Assessor:** Evaluates board relations, C-suite dynamics, and organizational alignment to advise on leadership strategy and conflict resolution.
* **Aid — Executive Speech & Communication Co-Pilot:** Drafts keynotes, all-hands addresses, shareholder letters, and high-stakes executive communications.
* **Represent — Executive Time & Strategic Focus Proxy:** Monitors executive calendar allocation against strategic priorities, flagging time-sinks and staging schedule reorganizations.


* **[restores] Aid — Development & Career Planning:** skill-gap analysis, improvement plans, career roadmap drafts. Existing tool: `executive-dev-career`.

* **[restores] Advise/Aid — 360 Feedback Collection & Synthesis:** aggregates real feedback data where connected. Existing tool: `executive-feedback`.

* **[restores] Advise — Risk & Scenario Advisory:** scenario modeling for major leadership decisions. Existing tool: `executive-risk-scenario`.

* **Tools Needed:** `calculate_calendar_time_allocation()`, `analyze_tone_and_sentiment()`, `draft_executive_brief()`, `parse_board_feedback()`.
* **Reasoning Needed:** Strategic narrative shaping; interpersonal dynamics analysis; balancing short-term operational fire-fighting with long-term strategic focus.
* **Persistent Data Categories:** Executive Goal Matrix, Stakeholder Maps, Leadership Values & Communication Style Guide, Board Governance Calendar.
* **Triggers:** Scheduled (weekly executive time-audit); Event-Driven (board meeting schedule update, critical stakeholder alert).
* **Interfaces:** Executive Calendar APIs, Email, Board Management Portals, Communication Platforms.
* **UX Needs:** Time allocation heatmaps, speech script outline editors, strategic focus balance scorecards.
* **Domain Knowledge:** Executive coaching, corporate governance, organizational psychology, high-stakes communication, change management.

---

### 4. Legal & Regulatory Advisor Assistant

* **Higher-Order Skills:**
* **Advise — Legal Risk, Compliance & Security Assessor:** Evaluates incoming contracts, regulatory updates, system security audits, and corporate policies against defined organizational risk tolerances.
* **Aid — Contract Redline & Clause Drafter:** Generates standardized contract redlines, fallback clause options, compliance policies, and term negotiation cheat sheets.
* **Represent — Matter Lifecycle & Document Dispatcher:** Manages contract workflow stages, tracks renewal/compliance deadlines, and stages finalizing documents for execution upon approval.


* **[restores] Advise/Hybrid — Legal Research & Precedent Finder:** statute database and case search synthesis. Existing tool: `legal-research`.

* **Tools Needed:** `diff_text_documents()`, `search_statute_database()`, `extract_contract_metadata()`, `tag_legal_clauses()`, `scan_security_compliance_logs()`.
* **Reasoning Needed:** Legal ambiguity analysis; balance-of-power evaluation in contractual terms; context-aware clause substitution based on risk appetite; regulatory mapping.
* **Persistent Data Categories:** Standard Playbook & Clause Library, Organizational Risk & Security Thresholds, Active Matter Directory, Historical Contract Archives.
* **Triggers:** Event-Driven (receipt of counterparty redline, regulatory feed update); Scheduled (90/60/30-day contract renewal & compliance audit horizons).
* **Interfaces:** Legal Research APIs, Document Management Systems (Google Drive, SharePoint), E-Signature Platforms (PandaDoc, DocuSign), Compliance/Security Logs.
* **UX Needs:** Side-by-side contract diff previews, risk scorecards with highlighted unacceptable terms, execution approval gates.
* **Domain Knowledge:** Contract law, commercial negotiation standards, regulatory compliance (GDPR, SOC2, HIPAA), legal/security liability mitigation.

---

### 5. Sales & Pipeline Revenue Assistant

* **Higher-Order Skills:**
* **Advise — Pipeline Velocity & Deal Strategist:** Analyzes CRM deal stages, buyer engagement signals, and win-loss history to identify stuck deals and forecast revenue; maintains CRM records and deal stages as data-maintenance sub-functions supporting pipeline analysis.
* **Aid — Account Brief & Meeting Preparation Co-Pilot:** Compiles comprehensive account dossiers, buyer persona briefings, and customized discovery call scripts prior to prospect meetings.
* **Represent — Autonomous Sequence & Outreach Manager:** Personalizes and schedules multi-touch sales sequences, monitoring response rates and pausing automatically upon prospect engagement.



* **Tools Needed:** `query_crm_contacts()`, `calculate_lead_score()`, `send_email_sequence()`, `fetch_company_firmographics()`, `update_deal_stage()`.
* **Reasoning Needed:** Prospect sentiment evaluation; matching prospect pain points to product value propositions; deal momentum decay detection.
* **Persistent Data Categories:** Ideal Customer Profile (ICP) definitions, Product Value Frameworks, Target Account Lists, Historical Deal Stages, Objection-Handling Matrices.
* **Triggers:** Data-Driven (lead score crosses threshold, deal remains in stage past average cycle time); Event-Driven (prospect opens proposal, replies to outreach).
* **Interfaces:** CRM Systems (Salesforce, HubSpot), Sales Engagement APIs (Outreach, Apollo), Enrichment Data (ZoomInfo, Clearbit), Calendar Systems.
* **UX Needs:** Pipeline velocity dashboards, target account battlecards, draft outreach approval queues.
* **Domain Knowledge:** B2B sales methodologies (MEDDPICC, Challenger), outbound messaging optimization, CRM hygiene standards, pipeline forecasting.

---

### 6. Event Operations & Planning Assistant

* **Higher-Order Skills:**
* **Advise — Event Feasibility & Budget Strategist:** Evaluates venue options, line-item budgets, and spatial/guest requirements to recommend optimal event execution plans.
* **Aid — Run-of-Show & Vendor Co-Working Engine:** Generates minute-by-minute operational schedules, banquet event order (BEO) summaries, and vendor requirement checklists; executes day-of check-in and live seating as the operational phase of the run-of-show. Existing tool: `event-day-of-operations`.
* **Represent — Guest & Vendor Communications Proxy:** Coordinates RSVP tracking, dispatches vendor queries, collects quotes, and sends attendee logistics updates.



* **Tools Needed:** `calculate_seating_layout()`, `track_budget_line_items()`, `send_rsvp_reminders()`, `parse_vendor_quote()`, `generate_calendar_invites()`.
* **Reasoning Needed:** Event flow and timing optimization; spatial allocation based on headcount; trade-off evaluation between vendor pricing structures.
* **Persistent Data Categories:** Master Event Specs, Budget Ledger, Vendor Directory & Rating History, Guest List & Dietary Matrix, Seating Models.
* **Triggers:** Scheduled (vendor payment milestone dates, RSVP deadline counters); Data-Driven (registration capacity reaches limits, budget allocation exceeds variance).
* **Interfaces:** Ticketing/RSVP Platforms (Eventbrite, Luma), Payment Gateways (Stripe), Messaging Platforms (Twilio, Email), Floor Plan Tools.
* **UX Needs:** Interactive budget tracking tables, visual run-of-show timelines, guest attendance matrix, vendor quote comparative tables.
* **Domain Knowledge:** Event logistics management, catering operations (BEOs), vendor contract structures, spatial design principles, crowd management timing.

---

### 7. Restaurant Operations & Hospitality Assistant

* **Higher-Order Skills:**
* **Advise — Menu Engineering & Cost Strategist:** Analyzes POS sales velocity alongside ingredient food costs to recommend menu pricing, dish placements, and inventory optimizations.
* **Aid — Shift & Prep List Co-Pilot:** Generates daily kitchen prep schedules and staff shift allocations based on historical cover forecasts, weather, and local events; coordinates kitchen station assignments and ticket routing (`restaurant-kitchen-service-operations`) as part of shift operational planning.
* **Represent — Reservations & Guest Profile Manager (Confirm-Before-Send):** Handles booking allocations,VIP preference updates, guest inquiry responses, and reservation adjustments.
* **Represent — Supply Chain & Inventory Reorder Manager:** Aggregates stock depletion data, drafts inventory reorders against supplier minimums, and queues purchase orders for manager confirmation.



* **[gap] Advise — Financial Performance & Demand Forecast Evaluator:** P&L/variance/demand forecasting. NEW — needs creation.

* **Tools Needed:** `fetch_pos_sales()`, `calculate_food_cost_margin()`, `query_inventory_levels()`, `generate_prep_quantities()`, `manage_reservation_book()`, `send_purchase_order()`.
* **Reasoning Needed:** Recipe yields and ingredient waste forecasting; labor-to-sales optimization modeling; menu placement psychology and margin trade-offs.
* **Persistent Data Categories:** Master Recipe & Ingredient Catalog, Inventory Stock Levels, Vendor Price Lists, POS Sales History, Guest CRM & VIP Profiles, Labor Schedule Rules.
* **Triggers:** Scheduled (daily morning prep list, weekly inventory audit); Data-Driven (critical inventory item drops below reorder point, reservation surge flagged).
* **Interfaces:** POS Systems (Toast, Square), Reservation Engines (OpenTable, Resy), Inventory Platforms (Restaurant365, MarketMan), Supplier Ordering Portals (Sysco, US Foods).
* **UX Needs:** Daily prep checklists, menu matrix (Stars, Dogs, Plowhorses, Puzzles), reservation timeline views, supplier PO draft confirmation modals.
* **Domain Knowledge:** Hospitality metrics (Prime Cost, RevPASH), kitchen operational workflows, food inventory management, reservation flow management, health code baselines.

---

### 8. Content Strategy & Publishing Assistant

* **Higher-Order Skills:**
* **Advise — Content Strategy & SEO Evaluator:** Analyzes target audience search intent, content performance analytics, and channel distribution trends to recommend editorial strategies.
* **Aid — Editorial Calendar & Article Co-Pilot:** Drafts long-form marketing articles, blog posts, SEO metadata, and content cluster blueprints alongside the user; publishes completed content to CMS platforms, sets canonical URLs, and generates platform-specific metadata as the editorial execution step; coordinates social and video platform distribution as additional output channels.



* **Tools Needed:** `calculate_readability_scores()`, `extract_keyword_density()`, `publish_to_cms()`, `generate_social_snippets()`, `fetch_ga4_metrics()`.
* **Reasoning Needed:** Optimizing search intent match without sacrificing brand voice; structuring content clusters for topical authority; audience engagement analysis.
* **Persistent Data Categories:** Content Style Guide, SEO Keyword Map, Publishing Schedule, Channel Performance Analytics.
* **Triggers:** Scheduled (weekly editorial queue digest); Event-Driven (draft completion event, published article performance audit).
* **Interfaces:** CMS Platforms (WordPress, Ghost, Medium), SEO Tools (Ahrefs, Semrush), Analytics (Google Analytics 4).
* **UX Needs:** Content cluster visualizers, side-by-side SEO scoring editors, pre-publication distribution confirmation previews.
* **Domain Knowledge:** SEO content architectures, search engine algorithms, content marketing conversion funnels, editorial style guides (AP, Chicago).

---

### 9. Songwriter Creative Assistant

* **Higher-Order Skills:**
* **Advise — Lyric & Structural Prosody Evaluator:** Analyzes song lyrics for meter, rhyme scheme tightness, stress patterns, and thematic coherence to suggest structural improvements.
* **Aid — Musical & Lyric Co-Creation Engine:** Generates chord progression ideas, rhyming couplets, verse-chorus transition concepts, and song section beat sheets; produces lead sheets, chord charts, and registration metadata as the output stage of the creative process.


* **[restores] Advise — Genre & Trend Positioning Evaluator:** market/audience trend fit. NEW — needs creation.

* **Tools Needed:** `analyze_rhyme_scheme()`, `extract_syllable_stress()`, `generate_chord_chart_pdf()`, `lookup_thesaurus_phonetics()`.
* **Reasoning Needed:** Prosodic stress matching (aligning natural speech accentuation with musical beats); metaphorical consistency; genre-specific lyric structure rules.
* **Persistent Data Categories:** Lyric Sketchbook, Genre Style Bibles, Song Idea Archive, Copyright/Registration Records.
* **Triggers:** User Prompt Driven (real-time creative session assistance).
* **Interfaces:** Digital Audio Workstation (DAW) metadata tools, Lead Sheet PDF export tools, Copyright registration portals.
* **UX Needs:** Interactive chord/lyric alignment workspace, prosody stress-highlighting views, audio-linked lead sheet export drawers.
* **Domain Knowledge:** Music theory, prosody rules, songwriting structural frameworks (AABA, Verse-Chorus-Bridge), lyric metrics and stress analysis.

---

### 10. Scriptwriter Creative Assistant

* **Higher-Order Skills:**
* **Advise — Narrative Arc & Pacing Evaluator:** Analyzes script formatting, scene pacing, character voice distinctiveness, and three-act narrative tension to recommend script rewrites.
* **Aid — Scene Beat & Dialogue Co-Pilot:** Generates scene beat sheets, character dialogue passes, subtext enhancements, and logline/synopsis options; formats completed scenes into Fountain/Final Draft and compiles pitch deck materials as the final output stage.


* **[restores] Advise — Genre & Market Positioning Evaluator:** mirrors Songwriter reasoning. NEW — needs creation.

* **Tools Needed:** `calculate_script_runtime()`, `verify_fountain_formatting()`, `export_final_draft_xml()`, `extract_character_line_counts()`.
* **Reasoning Needed:** Evaluating character dialogue differentiation; verifying visual storytelling rules ("show, don't tell"); pacing analysis (page-count to screen-time mapping).
* **Persistent Data Categories:** Screenplay Drafts, Character Bibles, World/Setting Guides, Scene Breakdown Logs.
* **Triggers:** User Prompt Driven (real-time script writing and feedback sessions).
* **Interfaces:** Scriptwriting Software Formats (Fountain, Final Draft), Pitch Deck Platforms.
* **UX Needs:** Dual-column dialogue/action editor views, character presence heatmaps, scene-by-scene pacing graphs.
* **Domain Knowledge:** Screenwriting standards (Final Draft/Fountain format), narrative theory (Save the Cat, Hero's Journey), dialogue subtext principles, film/TV pacing.

---

### 11. Sports Analytics & Wagering Assistant

* **Higher-Order Skills (Performance Group — Audience: Coaches, Analysts, Staff):**
* **Advise — Tactical & Roster Strategy Evaluator:** Synthesizes player performance metrics, opponent match-up data, and game film trends to recommend tactical adjustments and lineup optimizations.


* **Aid — Game Plan & Opposition Battlecard Creator:** Compiles opponent scout reports, situational playbooks, and key matchup cheat sheets for coaches and analysts.


* **Represent — Automated Scouting & Alert Dispatcher:** Tracks player health, performance anomalies, and transfer market updates, issuing real-time tactical alerts to staff.




* **Higher-Order Skills (Wagering Group — Audience: Individual Users, Entertainment Framing):**
* **Advise — Matchup & Odds Explainer:** Evaluates market odds, line movements, and statistical match-ups, framing insights strictly around entertainment and expected-value math. *Includes mandatory responsible-play language.*
* **Aid — Bankroll Co-Pilot:** Models unit sizing, Kelly Criterion limits, and historical exposure to help users maintain strict bankroll discipline.
* **Represent — Line-Alert Dispatcher:** Evaluates line movement significance relative to the user's betting strategy and current bankroll exposure; determines whether movements warrant informational alerts or action recommendations by integrating with Bankroll Co-Pilot state; distinguishes genuine value signals from market noise using historical variance patterns; dispatches contextualized alerts when conditions are material. *Structurally barred from ever placing wagers or accessing sportsbook accounts.*


* **[restores] Advise/Hybrid — In-Game & Predictive Modeling** (Performance group): from original audit. NEW — needs creation.

* **Tools Needed:** `fetch_player_stats()`, `calculate_expected_metrics()`, `parse_sportsbook_lines()`, `calculate_kelly_criterion()`, `send_alert_notification()`.
* **Reasoning Needed:** Performance: Cross-referencing telemetry metrics for tactical flaws. Wagering: Implied probability conversion, market variance calculation, responsible-play enforcement.


* **Persistent Data Categories:** *Strictly Isolated Data Stores.* Group A: Roster Telemetry, Scouting Archives, Tactical Playbooks. Group B: User Bankroll Rules, Unit Limits, Line Alert Specs. *No cross-feeding permitted.*


* **Triggers:** Scheduled (pre-match briefing 48h prior); Data-Driven (line movement alert, performance baseline drop).


* **Interfaces:** Group A: Sports Data APIs (StatsPerform, Opta), Wearable Telemetry. Group B: Odds Data APIs. *No Sportsbook Account APIs.*


* **UX Needs:** Matchup comparison matrices, bankroll variance charts, prominent Responsible Gaming disclaimer headers.
* **Domain Knowledge:** Advanced sports analytics (xG, PER, EPA), bankroll management mathematics, implied probability, line movement analysis.

---

### 12. Finance & FP&A Assistant (Business)

* **Higher-Order Skills:**
* **Advise — Financial Performance & Runway Strategist:** Evaluates P&L, balance sheets, cash burn rates, and margin variances to recommend cost optimizations and capital planning strategies.
* **Aid — Scenario Modeling & Board Reporting Co-Pilot:** Builds multi-variable financial forecasts, budget vs. actuals (BVA) models, and board deck financial summaries.
* **Represent — Governed Invoice & Reconciliation Manager:** Flags transaction anomalies, verifies invoice-to-PO matches, and stages batch accounting entries for sign-off.


* **[restores] Advise — Regulatory & Financial Risk Assessor:** compliance-risk review distinct from runway strategy. NEW — needs creation.

* **Tools Needed:** `fetch_general_ledger()`, `calculate_burn_rate()`, `run_cash_flow_projection()`, `parse_invoice_pdf()`, `stage_accounting_journal_entry()`.
* **Reasoning Needed:** Detecting subtle financial variance drivers; evaluating multi-scenario revenue projection risks; strategic capital allocation trade-offs.
* **Persistent Data Categories:** General Ledger Records, Chart of Accounts, Operating Budget Models, Historical BVA Data, Board Reporting Templates.
* **Triggers:** Scheduled (monthly financial close digest, quarterly forecasting cadence); Data-Driven (cash burn rate exceeds threshold).
* **Interfaces:** Accounting ERPs (NetSuite, QuickBooks, Xero), Banking APIs, Financial Modeling Engines.
* **UX Needs:** Interactive P&L variance tables, sensitivity slider modeling views, draft journal entry approval queues.
* **Domain Knowledge:** Corporate finance principles, US GAAP/IFRS standards, financial modeling, capital allocation strategies.

---

### 13. Wealth & Investment Management Assistant (Personal)

* **Higher-Order Skills:**
* **Advise — Personal Wealth Strategy & Tax-Efficiency Evaluator:** Reviews net worth, asset allocation across accounts, tax drag, and long-term liquidity to recommend portfolio rebalancing.
* **Aid — Personal Financial Life Event Simulator:** Models major financial milestones (home purchase, retirement horizons, tax strategies) to create step-by-step capital plans.
* **Represent — Bill Pay & Rebalancing Execution Proxy:** Tracks upcoming personal obligations, flags unusual bank fees, and stages rebalancing transfers for explicit user approval.


* **[restores] Represent/Proxy — Market Data & Research Access:** closest-to-production-ready skill. Existing tool: `investment-market-data`.

* **[restores] Advise — Portfolio Risk & Optimization Evaluator:** distinct from general wealth strategy. Existing tool: `portfolio-risk-advisory`.

* **Tools Needed:** `fetch_bank_balances()`, `calculate_portfolio_drift()`, `parse_tax_form_data()`, `project_compound_returns()`, `stage_bank_transfer()`.
* **Reasoning Needed:** Tax-loss harvesting analysis; balancing personal liquidity needs against long-term growth; risk tolerance alignment.
* **Persistent Data Categories:** Personal Net Worth Ledger, Asset Allocation Targets, Recurring Expense Rules, Tax Profile, Personal Financial Goals.
* **Triggers:** Scheduled (monthly net worth audit, tax estimation reminders); Data-Driven (portfolio drift exceeds variance target).
* **Interfaces:** Personal Financial Aggregators (Plaid), Brokerage APIs (Alpaca, Interactive Brokers), Bank Feeds.
* **UX Needs:** Asset allocation pie/bar charts, Monte Carlo growth simulation visualizers, staged transfer confirmation modals.
* **Domain Knowledge:** Modern Portfolio Theory (MPT), tax-efficient withdrawal strategies, personal cash flow management, asset location rules.

---

### 14. Healthcare & Wellness Operations Assistant

* **Higher-Order Skills:**
* **Advise — Clinical Practice & Workflow Evaluator:** Evaluates practice scheduling efficiency, patient retention patterns, and billing cycle delays to recommend operational improvements.
* **Advise — Clinical Decision-Support Evaluator:** Synthesizes patient medical history, symptoms, and evidence-based clinical guidelines to present differential diagnostic considerations and care pathways to providers.
* **Aid — Patient Care Plan & Educational Briefing Co-Pilot:** Generates customized patient educational materials, care plan summaries, and appointment preparation briefings.
* **Represent — Appointment & Patient Intake Dispatcher:** Automates patient reminder flows, processes pre-visit intake questionnaires, and flags missing documentation prior to visits.


* **[restores] Represent — Care Resource & Referral Coordinator:** from original audit. NEW — needs creation.

* **Tools Needed:** `fetch_ehr_appointments()`, `parse_intake_forms()`, `search_clinical_guidelines()`, `calculate_no_show_rates()`, `send_hipaa_compliant_message()`.
* **Reasoning Needed:** Identifying practice bottleneck root causes; evaluating clinical evidence and guideline matching; translating medical jargon into clear patient instruction.
* **Persistent Data Categories:** Practice Operational Templates, Patient Communication Rules, Provider Schedule Models, Evidence-Based Clinical Guidelines.
* **Triggers:** Scheduled (daily morning patient list digest); Event-Driven (patient intake form submission, appointment cancellation).
* **Interfaces:** EHR/EMR Platforms (Epic, AthenaHealth), Telehealth Gateways, Secure HIPAA-Compliant SMS/Email Gateways.
* **UX Needs:** Clinical decision-support summary cards, daily schedule utilization heatmaps, intake verification confirmation queues.
* **Domain Knowledge:** Practice management workflows, evidence-based clinical guidelines, HIPAA compliance rules, medical billing/coding cycles.

---

### 15. Hotel Operations & Guest Services Assistant

* **Higher-Order Skills:**
* **Advise — Revenue & Performance Advisory:** Analyzes ADR (Average Daily Rate), RevPAR, occupancy forecasts, and labor costs to recommend pricing and staffing adjustments.
* **Aid — Guest Experience Co-Pilot:** Compiles concierge knowledge, local recommendations, and drafted guest-service responses for front desk staff; dispatches guest communications (confirm-before-send) as part of the guest experience workflow.
* **Represent — Reservations & Guest Profile Manager (Confirm-Before-Send):** Handles room assignments, external channel bookings, billing updates, and guest loyalty preferences.
* **Represent — Property Operations Dispatcher (Confirm-Before-Send):** Manages housekeeping status, maintenance task dispatch, issue tracking, and linen/amenity inventory reorders.



* **Tools Needed:** `fetch_pms_occupancy()`, `calculate_revpar()`, `query_concierge_kb()`, `update_room_status()`, `dispatch_maintenance_ticket()`.
* **Reasoning Needed:** Yield management and dynamic pricing analysis; prioritizing guest recovery issues based on severity; balancing housekeeping workloads against check-in surges.
* **Persistent Data Categories:** Property Management System (PMS) Records, Guest Profiles & Preferences, Local Concierge Directory, Maintenance Log, Amenity Inventory.
* **Triggers:** Scheduled (daily morning shift report, daily yield management audit); Event-Driven (guest room issue reported, VIP check-in flagged).
* **Interfaces:** Property Management Systems (Opera, Cloudbeds), Maintenance Tracking Tools, Channel Managers, Guest Messaging Systems.
* **UX Needs:** Occupancy and RevPAR dashboards, guest service draft response boxes, maintenance task dispatch approval queues.
* **Domain Knowledge:** Hotel metrics (ADR, RevPAR, GOPPAR), PMS operations, guest service standards, yield management, hotel maintenance triage.

---

### 16. Education & Learning Strategy Assistant

* **Higher-Order Skills:**
* **Advise — Curriculum & Learning Velocity Evaluator:** Analyzes student performance data, learning pace, and retention drop-offs to recommend personalized study paths and curriculum adaptations.
* **Aid — Courseware & Practice Assessment Co-Pilot:** Generates custom lesson plans, practice exam modules, flashcard decks, and tailored rubric explanations based on target learning objectives; curates and accessibility-checks resource library materials (`education_resource_library`) as input sourcing for courseware creation.
* **Represent — Assignment Grading & Feedback Dispatcher:** Evaluates student submissions against rubric criteria, drafts structured feedback reports, and queues graded results for instructor sign-off.


* **[restores] Advise/Hybrid — Learner Insight & Analytics:** learning style, performance, progress, motivation from connected LMS. Real implementation exists (`education_learner_insight` in `education/index.ts`).

* **[restores] Advise — Adaptive Personalization Advisory:** differentiation and pacing from Learner Insight output. Real implementation exists (`education_adaptive_personalization` — has a template placeholder-fill bug to fix).


* **Tools Needed:** `calculate_spaced_repetition_intervals()`, `parse_quiz_results()`, `score_multiple_choice()`, `format_lms_gradebook_entry()`, `generate_pdf_quiz()`.
* **Reasoning Needed:** Diagnosing conceptual misunderstandings from incorrect answers; adjusting pedagogical approach based on learning style; balancing encouraging feedback with grading rigor.
* **Persistent Data Categories:** Curriculum Standards & Rubrics, Student Performance History, Knowledge Gap Maps, Course Material Libraries.
* **Triggers:** Scheduled (weekly student progress rollup); Event-Driven (assignment submission by student).
* **Interfaces:** Learning Management Systems (Canvas, Blackboard, Moodle), Assessment Platforms, Student Information Systems (SIS).
* **UX Needs:** Student mastery heatmaps, interactive practice quizzes, draft feedback queues for instructor review.
* **Domain Knowledge:** Pedagogical frameworks (Bloom’s Taxonomy, Spaced Repetition), curriculum design, assessment scoring methods, student engagement metrics.

---

### 17. Customer Support & Success Assistant

* **Higher-Order Skills:**
* **Advise — Customer Churn & Health Evaluator:** Analyzes usage trends, support ticket volume, and sentiment signals to identify churn risks and expansion opportunities.
* **Aid — Ticket Resolution & Troubleshooting Co-Pilot:** Aggregates customer account history, error logs, and knowledge base articles to draft context-aware support responses and step-by-step resolution plans.
* **Represent — Governed Ticket Escalation & Response Manager:** Dispatches routine resolution messages, updates ticket statuses, and routes complex technical issues to tier-2 engineering upon confirmation.


* **[restores] Advise — Support Operations Analytics & Staffing Planner:** distinct from Churn & Health. NEW — needs creation.

* **Tools Needed:** `fetch_ticket_history()`, `query_knowledge_base()`, `calculate_csat_score()`, `update_helpdesk_status()`, `send_customer_email()`.
* **Reasoning Needed:** Evaluating customer frustration/sentiment from ticket text; determining appropriate escalation paths; mapping customer descriptions to technical bug reports.
* **Persistent Data Categories:** Product Knowledge Base, Account Health Profiles, Support Escalation Protocols, Historical Ticket Log.
* **Triggers:** Event-Driven (inbound support ticket, CSAT survey completed); Data-Driven (product usage drops past churn threshold).
* **Interfaces:** Helpdesk Platforms (Zendesk, Intercom, Freshdesk), Product Analytics (Mixpanel, Amplitude), CRM Systems.
* **UX Needs:** Customer health dashboards, side-by-side ticket resolution previews, draft response queues.
* **Domain Knowledge:** Customer success metrics (CSAT, NPS, Churn Rate), SLA management, support escalation tiers, ticket triage.

---

### 18. HR & Talent Acquisition Assistant

* **Higher-Order Skills:**
* **Advise — Workforce Planning & Compensation Evaluator:** Evaluates team headcount needs, attrition trends, and market salary data to recommend hiring roadmaps and compensation structures.
* **Aid — Job Description & Interview Kit Co-Pilot:** Generates structured job descriptions, interview scorecards, role-specific behavioral questions, and rubric guides.
* **Represent — Candidate Screening & Scheduling Manager:** Filters inbound applicant profiles against role criteria, dispatches initial screening surveys, and coordinates interview availability.


* **[restores] Advise — Hiring Analytics & Compliance Evaluator:** EEOC compliance risk distinct from Workforce Planning. NEW — needs creation.

* **Tools Needed:** `parse_resume_skills()`, `calculate_salary_percentiles()`, `send_calendar_invite()`, `update_ats_stage()`, `trigger_background_check()`.
* **Reasoning Needed:** Assessing transferable skills in candidate resumes; evaluating cultural and capability alignment; balancing compensation expectations against budgets.
* **Persistent Data Categories:** Organizational Chart, Job Description Library, Compensation Band Benchmarks, Candidate Pipeline Records.
* **Triggers:** Scheduled (weekly hiring pipeline status report); Event-Driven (new candidate application received, interview feedback submitted).
* **Interfaces:** Applicant Tracking Systems (Greenhouse, Lever), HRIS Systems (Rippling, BambooHR), Calendar APIs.
* **UX Needs:** Candidate fit matrix, interactive interview panel schedules, draft candidate outreach queues.
* **Domain Knowledge:** Talent acquisition lifecycles, structured interview methodology, compensation benchmarking, employment law compliance (EEOC).

---

### 19. Product Management & Strategy Assistant

* **Higher-Order Skills:**
* **Advise — Product Roadmap & Feature Value Evaluator:** Analyzes user feedback, competitive intelligence, and development effort to prioritize product features and strategic roadmap themes.
* **Aid — PRD & User Story Co-Pilot:** Drafts comprehensive Product Requirement Documents (PRDs), user stories with acceptance criteria, and feature launch checklists.
* **Represent — Backlog Synchronization & Release Dispatcher:** Maps PRDs into actionable backlog tickets, syncs development status across platforms, generates stakeholder release notes, and triggers Slack/Calendar notifications to stakeholders as a downstream notification sub-function.


* **[restores] Advise/Hybrid — Product Usage & Analytics Insight:** telemetry data feeding roadmap decisions. NEW — needs creation.


* **Tools Needed:** `fetch_user_feedback()`, `parse_jira_epics()`, `calculate_wsjf_score()`, `generate_release_notes()`, `update_roadmap_status()`.
* **Reasoning Needed:** Evaluating feature trade-offs using prioritization frameworks; translating high-level business goals into precise engineering specs; identifying dependency bottlenecks.
* **Persistent Data Categories:** Product Vision & Strategy Docs, Feature Backlog, User Persona Models, Competitor Capability Matrix.
* **Triggers:** Scheduled (weekly roadmap milestone digest); Data-Driven (feature request volume crosses threshold).
* **Interfaces:** Project Management Tools (Jira, Linear), Product Analytics (Mixpanel, Pendo), Feedback Systems (Canny, UserVoice), Documentation (Confluence, Notion).
* **UX Needs:** Interactive roadmap visualizer, feature prioritization scoring tables, draft release note previews.
* **Domain Knowledge:** Product management frameworks (RICE, WSJF, Jobs-to-be-Done), Agile/Scrum methodologies, user telemetry interpretation.

---

### 20. Marketing Strategy & Campaign Operations Assistant

* **Higher-Order Skills:**
* **Advise — Campaign ROI & Channel Mix Evaluator:** Analyzes multi-channel conversion data, customer acquisition costs (CAC), and channel decay to recommend budget reallocations and messaging adjustments.
* **Aid — Campaign Asset & Copy Co-Pilot:** Generates ad copy variants, email marketing sequences, landing page messaging, and PR/media pitch briefs for fallback press needs.
* **Represent — Governed Campaign Dispatch & Asset Manager:** Schedules cross-channel content dispatches, updates ad targeting parameters, and monitors ad spend burn rates against campaign caps.


* **[restores] Advise — Audience & Market Research Insight Evaluator:** audience research distinct from ROI attribution. NEW — needs creation.

* **Tools Needed:** `fetch_ad_spend_metrics()`, `calculate_roas()`, `format_social_post()`, `trigger_email_blast()`, `update_ad_campaign_status()`.
* **Reasoning Needed:** Evaluating copy effectiveness across demographic segments; identifying creative fatigue; balancing top-of-funnel awareness with bottom-of-funnel conversion.
* **Persistent Data Categories:** Brand Positioning Guidelines, Target Audience Personas, Channel Performance Benchmarks, Campaign Asset Repository, Ad Spend Budgets.
* **Triggers:** Scheduled (weekly campaign performance digest); Data-Driven (CAC spikes past target threshold).
* **Interfaces:** Ad Platforms (Meta Ads, Google Ads), Marketing Automation (HubSpot, Marketo), Analytics (GA4), PR Distribution Networks (if media fallback used).
* **UX Needs:** Channel attribution breakdown tables, interactive content calendar boards, ad copy preview and approval cards.
* **Domain Knowledge:** Performance marketing dynamics, multi-touch attribution, copywriting frameworks (AIDA, PAS), conversion rate optimization (CRO).

---

### 21. Business Analytics Assistant

* **Higher-Order Skills:**
* **Advise — Business Insight & Trend Evaluator (Hybrid):** Connects to connected data warehouses/BI tools to evaluate operational trends, metric anomalies, and cross-departmental KPIs. *Features an explicit "Not Connected" fallback state rather than generating empty/fabricated valid data.*
* **Aid / Represent — None by Design:** Operating strictly as a query-and-explain analytical advisor without direct action or mutation responsibilities.


* **Tools Needed:** `execute_sql_query()`, `fetch_tableau_dashboard_data()`, `calculate_metric_variance()`, `detect_trend_anomalies()`.
* **Reasoning Needed:** Translating natural language business questions into precise analytical logic; identifying true signal vs. noise in complex datasets; synthesizing cross-functional data into executive summaries.
* **Persistent Data Categories:** Data Warehouse Schema Mappings, Metric Definitions & KPI Dictionary, Historical Query Cache.
* **Triggers:** User Query Driven; Scheduled (weekly executive KPI trends summary).
* **Interfaces:** Data Warehouses (Snowflake, BigQuery), BI Tools (Looker, Tableau, Metabase).
* **UX Needs:** Interactive data trend line charts, metric breakdown tables, explicit "Connector Offline / Not Configured" indicator banners.
* **Domain Knowledge:** Business intelligence architectures, SQL/data modeling principles, statistical trend analysis, cross-functional KPI frameworks.
---

## Net Effect

| Metric | Before | After |
|---|---|---|
| Category A/B Represent skills resolved | — | 12 (11 merged, 1 promoted) |
| Total Represent skills across all assistants | ~40 | ~29 |
| Total higher-order skills across all 21 | ~76 | ~95 |

