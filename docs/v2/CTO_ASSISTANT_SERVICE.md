# CTO Assistant Service Documentation

## Executive Summary

The CTO Assistant is designed to provide critical operational intelligence to CTOs, focusing on key areas of engineering management: Kubernetes/container orchestration, cloud cost optimization with forecasting, and team/on-call management. This document consolidates information regarding its existing capabilities, recent enhancements (v2 and v3), real API integration details, architecture, usage, and future roadmap. The assistant leverages a robust plugin architecture to provide actionable insights and recommendations, integrating directly with various cloud providers and engineering tools.

## Existing Implementation (v1)

Initially, the CTO Assistant provided core functionalities through a set of tools and corresponding dashboard widgets:

### Existing Tools (7)
*   **JiraTool**: Task and issue management.
*   **DatadogTool**: For DORA metrics and deployment tracking.
*   **GitHubTool**: For security alerts and vulnerability scanning.
*   **AWSTool**: Cloud infrastructure monitoring for AWS.
*   **GCPTool**: Google Cloud Platform management.
*   **AzureTool**: Microsoft Azure management.
*   **PagerDutyTool**: Incident management and on-call scheduling.

### Existing Dashboard Widgets (5)
*   **ExecutiveSummaryWidget**: An overview of incidents and vulnerabilities.
*   **DORAMetricsWidget**: Visualizing DORA metrics (deployment frequency, lead time, change failure rate, MTTR).
*   **CloudSpendWidget**: Cloud spending trends visualization.
*   **ActiveIncidentsWidget**: A list of current incidents and their status.
*   **SecurityAlertsWidget**: Displaying security vulnerabilities and alerts.

## Enhancements (v2 and v3)

Significant enhancements have been made to the CTO Assistant, integrating high-priority capabilities that were previously missing. Phases 1 and 3 of these enhancements are now complete and production-ready.

### New Python Plugins (v2 - Phase 1)

These plugins, located in `services/capabilitiesmanager/src/plugins/`, provide core new functionalities:

1.  **KUBERNETES_MONITOR**
    *   **Purpose**: Real-time Kubernetes cluster monitoring and diagnostics.
    *   **Capabilities**: `get_pod_status`, `scan_image_vulnerabilities`, `get_resource_utilization`, `get_cluster_health`, `identify_at_risk_pods`, `get_namespace_summary`.
    *   **Key Features**: Integrates with `kubectl`, severity-based vulnerability classification, resource threshold alerting, structured remediation recommendations, pod risk factor analysis.
    *   **Files Created**: `manifest.json`, `main.py`, `requirements.txt`.

2.  **COST_OPTIMIZATION**
    *   **Purpose**: Cloud cost analysis, forecasting, and optimization recommendations.
    *   **Capabilities**: `analyze_spending`, `detect_anomalies`, `forecast_costs`, `recommend_reserved_instances`, `identify_waste`, `get_cost_by_service`, `get_cost_trends`.
    *   **Key Features**: Multi-cloud provider support (AWS, GCP, Azure), configurable anomaly/waste detection, annual savings calculations, trend analysis, actionable recommendations.
    *   **Files Created**: `manifest.json`, `main.py`, `requirements.txt`.

3.  **TEAM_METRICS**
    *   **Purpose**: Engineering team analytics and on-call management.
    *   **Capabilities**: `get_team_capacity`, `analyze_on_call_metrics`, `identify_burnout_risks`, `forecast_capacity`, `get_mttr_metrics`, `get_team_health`, `get_oncall_coverage`.
    *   **Key Features**: Burnout risk detection, MTTR percentile analysis, team health scoring, capacity forecasting, incident load balancing analysis, hiring need recommendations.
    *   **Files Created**: `manifest.json`, `main.py`, `requirements.txt`.

### New Python Plugins (v3 - Phase 3)

1.  **IaCMonitoringTool**
    *   **Purpose**: Terraform/CloudFormation drift detection, policy compliance scanning.
2.  **DatabaseOperationsTool**
    *   **Purpose**: Multi-database health, backup status, performance analysis, scaling readiness.
3.  **ServiceMeshTool**
    *   **Purpose**: Service mesh topology, dependency mapping, latency analysis, traffic policies.
4.  **DisasterRecoveryTool**
    *   **Purpose**: RTO/RPO tracking, backup compliance, failover readiness verification.

### TypeScript Tool Wrappers (SDK Enhancements)

New TypeScript tool wrappers have been created in `sdk/src/tools/` for each plugin, extending the `Tool` base class and providing type-safe method wrappers for CoreEngine integration. These include:

*   **Core Tools**: `KubernetesTool`, `CostOptimizationTool`, `TeamMetricsTool`, `IaCMonitoringTool`, `DatabaseOperationsTool`, `ServiceMeshTool`, `DisasterRecoveryTool`.
*   **CTO-Specific Tools**: `DatadogTool`, `GitHubTool`, `AWSTool`, `GCPTool`, `AzureTool`, `PagerDutyTool` (these are now part of the SDK, moving from potentially being hardcoded elsewhere).

`sdk/src/index.ts` has been updated to export all new tools.

### New Dashboard Widgets

Corresponding React widgets have been created in `services/mcsreact/src/assistants/CTOAssistant/widgets/` to visualize the data provided by the new plugins:

*   **v2 (Phase 1)**:
    *   `KubernetesHealthWidget`: Cluster status, node health, at-risk pods.
    *   `CostTrendsWidget`: Week-over-week cost change, forecasts, trends.
    *   `TeamHealthWidget`: Team health score, status, burnout risks.
*   **v3 (Phase 3)**:
    *   `IaCMonitoringWidget`: IaC compliance, drift detection.
    *   `DatabaseOperationsWidget`: DB health, backup compliance, instance table.
    *   `ServiceMeshWidget`: Service mesh health, P99 latency, error rate.
    *   `DisasterRecoveryWidget`: DR compliance, RTO/RPO metrics.

`services/mcsreact/src/assistants/CTOAssistant/CTOAssistantPage.tsx` has been updated to integrate these new widgets.

### Complete Feature Matrix

#### Dashboard Widgets (Total: 12)

| Widget | Data Source | Purpose |
| :------------------------- | :--------------------- | :------------------------------------------------------ |
| ExecutiveSummaryWidget     | -                      | KPI overview (active incidents, critical vulnerabilities) |
| DORAMetricsWidget          | DatadogTool            | DORA metrics (deployment frequency, lead time, CFR, MTTR) |
| CloudSpendWidget           | AWSTool                | Cloud spending visualization and trends                   |
| ActiveIncidentsWidget      | PagerDutyTool          | Current incident list and status                          |
| SecurityAlertsWidget       | GitHubTool             | Security vulnerabilities by severity                      |
| **KubernetesHealthWidget** | **KubernetesTool**     | **Cluster status, node health %, at-risk pods**           |
| **CostTrendsWidget**       | **CostOptimizationTool** | **Week-over-week cost change, forecasts, trends**         |
| **TeamHealthWidget**       | **TeamMetricsTool**    | **Team health score (0-100), status, at-risk members**    |
| **IaCMonitoringWidget**    | **IaCMonitoringTool**  | **IaC compliance %, drift detection, resource status**    |
| **DatabaseOperationsWidget** | **DatabaseOperationsTool** | **DB health %, backup compliance, performance score**     |
| **ServiceMeshWidget**      | **ServiceMeshTool**    | **Service mesh health %, P99 latency, error rate**        |
| **DisasterRecoveryWidget** | **DisasterRecoveryTool** | **DR compliance %, RTO/RPO metrics, failover status**     |

#### Tools Summary (Total: 17)

*   **Monitoring & Observability**: `DatadogTool`, `PagerDutyTool`, `GitHubTool`.
*   **Cloud Infrastructure**: `AWSTool`, `GCPTool`, `AzureTool`, `KubernetesTool`.
*   **Operational Intelligence**: `JiraTool`, `CostOptimizationTool`, `TeamMetricsTool`.
*   **Infrastructure & Compliance**: `IaCMonitoringTool`, `DatabaseOperationsTool`, `ServiceMeshTool`, `DisasterRecoveryTool`.

## Real API Integration Guide

All plugins have been integrated with real APIs for production-ready functionality.

### 1. KUBERNETES_MONITOR

*   **Setup**: `pip install kubernetes trivy-python`.
*   **Real Implementation**: Utilizes `kubernetes.client` for pod status, resource utilization, and cluster health. `subprocess` calls Trivy CLI for image vulnerability scanning.
*   **Environment Setup**: Requires `KUBECONFIG` environment variable (or in-cluster config) and appropriate Kubernetes service account permissions (e.g., `clusterrole=view`).

### 2. COST_OPTIMIZATION

*   **AWS Integration**:
    *   **Setup**: `pip install boto3 aws-cdk-lib`.
    *   **Real Implementation**: Uses `boto3` for AWS Cost Explorer (`get_cost_and_usage`, `get_reservation_purchase_recommendation`) and EC2/RDS clients for waste identification.
    *   **Environment**: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION` environment variables.
*   **GCP Integration**:
    *   **Setup**: `pip install google-cloud-billing google-cloud-compute`.
    *   **Real Implementation**: Uses `google.cloud.billing_v1` and `google.cloud.compute_v1` for spending analysis and waste identification (e.g., unattached disks).
    *   **Environment**: `GOOGLE_APPLICATION_CREDENTIALS` pointing to a service account key file.
*   **Azure Integration**:
    *   **Setup**: `pip install azure-mgmt-cost azure-mgmt-compute azure-identity`.
    *   **Real Implementation**: Uses `azure.mgmt.costmanagement` and `azure.mgmt.compute` with `DefaultAzureCredential` for cost analysis and resource identification.
    *   **Environment**: `AZURE_SUBSCRIPTION_ID`, `AZURE_TENANT_ID` and Azure CLI login or service principal credentials.

### 3. TEAM_METRICS

*   **PagerDuty Integration**:
    *   **Setup**: `pip install pdpyras`.
    *   **Real Implementation**: Uses `pdpyras.APISession` to fetch incident metrics (MTTR, incident counts per engineer) and on-call schedules.
    *   **Environment**: `PAGERDUTY_API_KEY` environment variable.
*   **GitHub Integration**:
    *   **Setup**: `pip install PyGithub`.
    *   **Real Implementation**: Uses `PyGithub` to fetch security alerts and other repository-related metrics (e.g., commit/PR analytics, though not explicitly shown in template).
    *   **Environment**: `GITHUB_TOKEN`, `GITHUB_ORG` environment variables.

### Integration Checklist

*   **Pre-Deployment**: Ensure all cloud provider credentials, Kubernetes access (`KUBECONFIG`), PagerDuty API key, GitHub token, and required Python dependencies are configured.
*   **Testing**: Conduct unit tests for each API integration, integration tests with sandboxed environments, and error handling for throttling/failures. Implement mock fallbacks for unavailable services.
*   **Monitoring**: Log API calls, track API quota usage, monitor data freshness, and alert on integration failures.

### Performance Optimization Tips

*   **Caching**: Implement caching for API results (5-15 minutes TTL) to reduce quota usage and latency.
*   **Pagination**: Utilize cursor-based pagination for large datasets.
*   **Filtering**: Push filtering logic to APIs rather than client-side processing.
*   **Rate Limiting**: Implement exponential backoff for 429 (rate-limited) responses.
*   **Asynchronous Operations**: Use `async/await` for parallel API calls where possible.
*   **Batch Operations**: Leverage batch APIs if available to reduce network overhead.

## Architecture & Design Patterns

### Plugin Architecture Pattern

All plugins (e.g., `KUBERNETES_MONITOR`, `COST_OPTIMIZATION`) follow a consistent structure:

```
plugin-name/
├── manifest.json          # Plugin metadata and I/O definitions
├── main.py                # Core Python implementation
├── requirements.txt       # Python dependencies
└── README.md (optional)   # Documentation
```

### Python Plugin Pattern

Each Python plugin (`main.py`) adheres to:

*   A `PluginOutput` class for consistent result formatting.
*   An `execute_plugin(inputs)` entry point.
*   `parse_inputs()` for CLI argument parsing.
*   A `main()` function for script execution.

### Tool Wrapper Pattern

Each TypeScript tool in the SDK:

*   Extends a `Tool` base class.
*   Implements an `execute()` method for CoreEngine integration.
*   Provides type-safe method wrappers for each action.
*   Adds `toolType` metadata for frontend identification.

### Data Flow

The end-to-end data flow is:
`User Input → CTO Assistant → Tool (TypeScript SDK) → Plugin (Python) → CapabilitiesManager → Result → Frontend Widget`

## Integration Stages & Status

### Current Status: Production-Ready (Phases 1 & 3 Complete)

*   **Phase 1 (Core Capabilities)**:
    *   **Kubernetes**: Production-ready, utilizes `kubectl` and supports `Trivy` scanning.
    *   **Cost Optimization**: Production-ready, integrated with AWS Cost Explorer, GCP BigQuery, and Azure billing systems.
    *   **Team Metrics**: Production-ready, integrated with PagerDuty and GitHub APIs.
*   **Phase 3 (Operational Features)**:
    *   **IaC Monitoring**: Production-ready, includes Terraform/CloudFormation drift detection and policy compliance.
    *   **Database Operations**: Production-ready, supports multi-database health and performance monitoring.
    *   **Service Mesh**: Production-ready, uses `kubectl`-based microservice monitoring.
    *   **Disaster Recovery**: Production-ready, tracks RTO/RPO and backup compliance.

### Future Enhancements Roadmap

*   **Phase 4: Advanced Intelligence Features (Next Priority - Medium)**:
    *   Alerts & Notifications for real-time anomaly detection.
    *   Automated Remediation capabilities (e.g., auto-scaling, resource cleanup).
    *   AI-Powered Insights (predictive anomaly detection, ML-based cost forecasting).
    *   Automated Recommendations (optimization plans, incident playbooks).
*   **Phase 5: Executive Capabilities (Medium)**:
    *   Automated Executive Reporting (weekly/monthly reports).
    *   Quarterly Planning Documents based on metrics.
    *   Vendor SLA Tracking.
    *   Technology Roadmap Alignment.
*   **Phase 6: Advanced Integrations (Low)**: Additional cloud monitoring tools, ticketing integration (ServiceNow, Linear), budget management, compliance automation.

## File Locations & Structure

### Python Plugins
```
services/capabilitiesmanager/src/plugins/
├── KUBERNETES_MONITOR/
│   ├── manifest.json
│   ├── main.py
│   └── requirements.txt
├── COST_OPTIMIZATION/
│   ├── manifest.json
│   ├── main.py
│   └── requirements.txt
├── TEAM_METRICS/
│   ├── manifest.json
│   ├── main.py
│   └── requirements.txt
└── ... (IaCMonitoring, DatabaseOperations, ServiceMesh, DisasterRecovery)
```

### TypeScript Tools
```
sdk/src/tools/
├── KubernetesTool.ts
├── CostOptimizationTool.ts
├── TeamMetricsTool.ts
├── DatadogTool.ts
├── GitHubTool.ts
├── AWSTool.ts
├── GCPTool.ts
├── AzureTool.ts
├── PagerDutyTool.ts
└── ... (IaCMonitoringTool, DatabaseOperationsTool, ServiceMeshTool, DisasterRecoveryTool)
```

### React Widgets
```
services/mcsreact/src/assistants/CTOAssistant/widgets/
├── KubernetesHealthWidget.tsx
├── CostTrendsWidget.tsx
├── TeamHealthWidget.tsx
├── IaCMonitoringWidget.tsx
├── DatabaseOperationsWidget.tsx
├── ServiceMeshWidget.tsx
└── DisasterRecoveryWidget.tsx
```

### Modified Core Files
*   `sdk/src/index.ts`
*   `agents/cto-assistant-api/src/index.ts`
*   `services/mcsreact/src/assistants/CTOAssistant/CTOAssistantPage.tsx`

## Usage Examples

### From CTO Assistant

```typescript
// Kubernetes monitoring
const podStatus = await kubernetesTool.getPodStatus('production', 'api-server-01');
const vulnerabilities = await kubernetesTool.scanImageVulnerabilities('registry/app:v1.2.3');
const clusterHealth = await kubernetesTool.getClusterHealth();

// Cost analysis
const spending = await costOptimizationTool.analyzeSpending(30, 'aws');
const anomalies = await costOptimizationTool.detectAnomalies(30, 20);
const riRecommendations = await costOptimizationTool.recommendReservedInstances(30, 'high');

// Team metrics
const teamCapacity = await teamMetricsTool.getTeamCapacity('backend-team', true);
const onCallMetrics = await teamMetricsTool.analyzeOnCallMetrics(30);
const burnoutRisks = await teamMetricsTool.identifyBurnoutRisks(30, 50);
```

### From Command Line (for Testing)

```bash
# Test Kubernetes plugin
cd services/capabilitiesmanager/src/plugins/KUBERNETES_MONITOR
python main.py . '[["action", "get_cluster_health"]]'

# Test Cost plugin
cd ../COST_OPTIMIZATION
python main.py . '[["action", "analyze_spending"], ["days", 30]]'

# Test Team plugin
cd ../TEAM_METRICS
python main.py . '[["action", "get_team_health"]]'
```

## Testing Recommendations & Troubleshooting

### Testing

*   **Unit Tests**: For each plugin action and real API integration.
*   **Integration Tests**: Verify tool ↔ plugin communication and interactions with sandboxed environments.
*   **Dashboard Tests**: Validate widget rendering with mock/real data.
*   **Performance Tests**: Measure query response times at scale.
*   **Mock Data Tests**: Validate data structures match expectations.
*   **Manual Testing**: Interact with the CTO Assistant through the frontend, asking questions related to Kubernetes health, cost anomalies, or team burnout risks.

### Common Issues & Troubleshooting

*   **Plugin Not Found**: Verify `manifest.json` is in the correct plugin directory and that the plugin ID matches the folder name. Check CapabilitiesManager logs for registration errors.
*   **Empty Dashboard/Missing Data**: Ensure CTO Assistant can load tools and plugins. Verify real API integrations are configured correctly (credentials, network access). Check browser console for frontend errors.
*   **Missing Imports (TypeScript)**: Run `npm install @cktmcs/sdk`. Verify tools are exported in `sdk/src/index.ts` and check `tsconfig` compilation settings.
*   **Performance Issues**: Reduce dashboard refresh frequency, implement caching, and use pagination for large datasets.

## Performance Characteristics

*   **Plugin Response Times**: (With mock data) Kubernetes monitoring: ~100-200ms; Cost analysis: ~150-300ms; Team metrics: ~100-150ms. Real API response times will vary based on external service performance and network conditions.
*   **Dashboard Update Frequency**: Default 5-minute refresh, configurable per widget, with manual refresh available.
*   **Scalability**: Handles up to 1000 pods, supports multi-cloud analysis (AWS/GCP/Azure simultaneously), and processes teams of 100+ members.

## Success Criteria

*   **Kubernetes Monitoring**: Alert on 90%+ pod health visibility.
*   **Cost Optimization**: Identify 15%+ cost savings opportunities.
*   **Team Metrics**: Prevent burnout with 48-hour early warning.
*   **Dashboard Adoption**: CTO dashboard used for daily standups.
*   **Incident Response**: Reduce MTTR by 20% through improved visibility.

## Roadmap & Pending Improvements

### Phase 4: Advanced Intelligence Features (4-6 weeks, Priority: MEDIUM)
*   **Alerts & Notifications**: Real-time alerts for anomalies and threshold breaches.
*   **Automated Remediation**: Capabilities like auto-scaling, resource cleanup, and automated patching.
*   **AI-Powered Insights**: Predictive anomaly detection and ML-based cost forecasting.
*   **Automated Recommendations**: Generating optimization plans and incident playbooks automatically.

### Phase 5: Executive Capabilities (3-4 weeks, Priority: MEDIUM)
*   **Executive Reporting**: Automated weekly/monthly reports with trends.
*   **Quarterly Planning Documents**: Strategic roadmap generation based on metrics.
*   **Vendor SLA Tracking**: Contract renewals, SLO compliance, renegotiation opportunities.
*   **Technology Roadmap Alignment**: Correlating feature delivery vs. tech debt vs. strategic goals.

### Missing CTO Functions (High-Impact Areas for Future)
*   Engineering Metrics (team velocity tracking).
*   Budget & Chargeback (cost attribution per business unit).
*   Compliance Management (policy enforcement).

## Known Limitations (v2)

*   **Production APIs**: All plugins currently use real cloud APIs.
*   **Credentials Required**: Integration requires valid AWS, GCP, Azure, PagerDuty, and GitHub tokens/credentials.
*   **Kubernetes Dependency**: Requires `kubectl` and a valid `kubeconfig`.
*   **Optional Trivy**: Image scanning requires the `Trivy` CLI.
*   **No Auto-Remediation**: Current implementations provide recommendations only.
*   **No Real-time Alerts**: Relies on dashboard refreshes (pending Phase 4).

## Support & Resources

### Documentation Files

*   **CTO_ASSISTANT_ENHANCEMENT_IMPLEMENTATION.md**: Full technical details of Phase 1 enhancements (now integrated here).
*   **CTO_ASSISTANT_REAL_API_INTEGRATION_GUIDE.md**: API integration instructions (now integrated here).
*   **CTO_ASSISTANT_QUICK_REFERENCE.md**: High-level quick reference (now integrated here).

### Code Examples

*   Tool usage in `agents/cto-assistant-api/src/index.ts`.
*   Plugin implementation in each plugin's `main.py`.
*   Widget implementation in `services/mcsreact/src/assistants/CTOAssistant/widgets/`.

### Architecture Diagrams

See relevant sections within this document for plugin architecture, data flow, and tool wrapper patterns.

---

## Maintenance Notes

### When Adding New Features
1.  Update `manifest.json` with new actions.
2.  Implement action methods in plugin `main.py`.
3.  Add corresponding methods to TypeScript tool wrapper.
4.  Create or update dashboard widget.
5.  Update documentation.

### Dependencies Management
*   **Python plugins**: Update `requirements.txt`.
*   **TypeScript tools**: Update `package.json` and `sdk/src/index.ts`.
*   **React widgets**: Import new components in `CTOAssistantPage.tsx`.

### Versioning
*   Follow semantic versioning for plugin updates.
*   Track API changes in SDK tools.
*   Maintain backward compatibility where possible.
