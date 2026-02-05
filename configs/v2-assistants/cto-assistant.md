# V2 Assistant Specification: CTO Assistant

## 1. Persona and Role

**Persona:** The CTO Assistant is a data-driven, analytical, and proactive partner for a Chief Technology Officer leading a SaaS company. It is concise, precise, and capable of synthesizing complex technical and operational data into high-level, actionable insights. It communicates in a professional tone, prioritizing metrics, security posture, and engineering velocity.

**Role:** The assistant provides a unified command center for the CTO to monitor, manage, and strategize across three core domains: Software Engineering, Security & Compliance, and Cloud Operations. It acts as a first line of inquiry, an automated reporting engine, and an early warning system.

## 2. Core Capabilities

### a. Software Engineering Management

-   **Development Velocity Tracking:** Provides real-time analysis of DORA metrics (Deployment Frequency, Lead Time for Changes, Change Failure Rate, Mean Time to Recovery).
-   **Project & Sprint Monitoring:** Integrates with project management tools (e.g., Jira) to report on sprint progress, epic burndown, and ticket lifecycle.
-   **Code Quality & Health:** Surfaces metrics from code analysis tools, including code coverage, technical debt, and critical code smells.
-   **Team Performance Insights:** Aggregates pull request data, including cycle time, review distribution, and merge rates.

### b. Security & Compliance Monitoring

-   **Vulnerability Management:** Ingests and prioritizes alerts from security scanners (Snyk, Dependabot, etc.), highlighting critical vulnerabilities in production and staging environments.
-   **Threat Intelligence:** Monitors feeds for new threats relevant to the company's tech stack and provides summaries.
-   **Compliance Posture:** Tracks compliance status against frameworks like SOC 2 and ISO 27001 by monitoring control evidence from connected tools.
-   **Access Control Auditing:** Provides reports on user access to critical systems (e.g., production databases, cloud provider admin roles).

### c. Cloud Operations & Financials

-   **Cloud Cost Management:** Analyzes and visualizes cloud spend (AWS, GCP, Azure), identifying cost-saving opportunities and budget anomalies.
-   **System Reliability & Uptime:** Monitors and reports on Service Level Objectives (SLOs) and Service Level Indicators (SLIs) from observability platforms (e.g., Datadog, New Relic).
-   **Incident Management:** Provides a real-time view of active incidents, on-call schedules, and post-mortems from incident management tools (e.g., PagerDuty, Opsgenie).
-   **Infrastructure Health:** Summarizes the health of key infrastructure components and services.

## 3. Required Tools & Plugins

The CTO Assistant will require a suite of plugins to integrate with authoritative data sources:

-   **`JIRA_PLUGIN`**: For project and sprint data.
-   **`GITHUB_PLUGIN`**: For PR metrics, code repository statistics, and Dependabot alerts.
-   **`CI_CD_PLUGIN`** (e.g., Jenkins, GitLab, CircleCI): For DORA metrics.
-   **`SONARQUBE_PLUGIN`**: For code quality and technical debt metrics.
-   **`SNYK_PLUGIN`**: For vulnerability scanning and reporting.
-   **`DATADOG_PLUGIN`**: For infrastructure health, SLO/SLI tracking, and custom metrics.
-   **`AWS_COST_EXPLORER_PLUGIN`**: For cloud financial data.
-   **`PAGERDUTY_PLUGIN`**: For incident status and on-call schedules.
-   **`WEB_SEARCH`**: For ad-hoc technology research and threat intelligence gathering.
-   **`DOC_PARSER`**: For summarizing long-form technical documents, architecture diagrams, or security reports.

## 4. Frontend UI/UX Design

The assistant's frontend is a dashboard-centric interface designed for high-level situational awareness with drill-down capabilities.

-   **Main View:** A configurable dashboard with widgets for key areas.
    -   **Executive Summary Widget:** A top-line summary of system status: `System Status: Nominal`, `Active Incidents: 1`, `New Critical Vulnerabilities: 3`.
    -   **DORA Metrics Widget:** Displays the four key DORA metrics with trends over the last 30 days.
    -   **Active Incidents Widget:** A list of currently active PagerDuty incidents, with severity, title, and current assignee.
    -   **Security Posture Widget:** Shows a count of critical/high vulnerabilities by project and a compliance check summary.
    -   **Cloud Spend Widget:** A line chart showing cloud spend for the current month vs. last month, with a projection.
-   **Conversational Interface:** A persistent chat interface allowing the CTO to ask specific questions, such as:
    -   "What's the status of the 'Q2-Payments-Refactor' epic?"
    -   "Show me all critical vulnerabilities in the 'checkout-service' repository."
    -   "What was our cloud spend last month, broken down by service?"
    -   "Who is on-call for the platform team right now?"
-   **Drill-Downs:** Clicking on a widget or a metric will refine the conversational context or open a more detailed modal view. For example, clicking the "Active Incidents" widget would prompt the assistant with "Tell me more about the active incidents."

## 5. Example Interaction Flow

1.  **CTO opens the assistant:** The dashboard immediately presents the high-level status of engineering, security, and operations. The CTO sees a spike in cloud spend.
2.  **CTO asks for details:** Clicks on the "Cloud Spend" widget. The chat pre-fills with "Analyze the latest cloud spend data."
3.  **Assistant responds:** "Cloud spend is up 15% this week, primarily driven by a 40% increase in S3 costs in the `us-east-1` region, related to the `data-processing-pipeline`."
4.  **CTO delegates action:** "Create a Jira ticket for the platform team to investigate the S3 cost spike. Set it as 'High' priority and include the cost analysis graph."
5.  **Assistant confirms:** The `JIRA_PLUGIN` is used, and the assistant replies: "Done. I have created ticket `PLAT-1721` and assigned it to the platform team lead."
