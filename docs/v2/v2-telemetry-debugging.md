# V2 - Telemetry and Debugging Across Layers

This document outlines a strategy for enhancing telemetry and debugging capabilities across all layers (L1 Core Engine, L2 Assistant SDK, L3 API Service, L3 Frontend `mcsreact`) of the stage7 v2 architecture. The goal is to provide end-to-end visibility into mission execution, agent reasoning, tool usage, human interactions, and performance bottlenecks in a complex, multi-layered distributed system.

## 1. Introduction and Goals

Given the distributed nature of the Core Engine and the new layers introduced by the SDK and L3 API, effective observability is paramount. Without it, diagnosing issues, understanding agent behavior, and optimizing performance become nearly impossible.

**Goals:**
*   **End-to-End Traceability:** Track a single user request or mission from the UI, through the L3 API, SDK, and into the L1 microservices.
*   **Contextual Debugging:** Provide sufficient context (e.g., Mission ID, Conversation ID, User ID) with every log and metric.
*   **Performance Monitoring:** Identify latency bottlenecks and resource utilization across services.
*   **Proactive Error Detection:** Alert on critical errors and unusual system behavior.
*   **Agent Behavior Insight:** Understand how agents are reasoning, planning, and executing.

## 2. Standardized Logging

A consistent logging strategy is the foundation of good observability.

*   **Common Logging Framework:**
    *   **L1 (Python services):** `logging` module with structured logging handlers.
    *   **L2 (TypeScript/JavaScript SDK):** `winston` or `pino` for Node.js environments.
    *   **L3 API Service (TypeScript/JavaScript):** `winston` or `pino`.
    *   **L3 Frontend (`mcsreact`):** Console logging augmented with client-side error reporting (e.g., Sentry).
*   **Structured Logging (JSON):** All logs should be output in JSON format to facilitate parsing, filtering, and analysis by log aggregation tools (e.g., ELK Stack, Splunk, DataDog Logs).
*   **Log Levels:** Strictly adhere to standard log levels (DEBUG, INFO, WARN, ERROR, CRITICAL).
*   **Correlation IDs:**
    *   **Request ID:** Unique ID for each incoming HTTP request to the L3 API and for WebSocket connections.
    *   **Mission ID / Conversation ID:** Passed through all layers to link all events related to a specific agent mission/conversation.
    *   **User ID:** Identifies the user initiating the interaction.
    *   **Agent ID / Step ID:** Specific to L1 agent execution, linked to Mission ID.
*   **Log Enrichment:** Automatically add metadata to logs (service name, host, timestamp, source code location).

## 3. Distributed Tracing

Distributed tracing provides a visual representation of request flow across services.

*   **Implementation:** Adopt OpenTelemetry (or Jaeger directly) as the standard for tracing.
*   **Tracing Spans:**
    *   **L3 Frontend:** User interactions, API calls to L3 API service.
    *   **L3 API Service:** Incoming requests, calls to SDK methods, outbound calls to L1 services.
    *   **L2 Assistant SDK:** Start/end of `Assistant.startConversation`, `Tool.execute`, `Conversation.sendMessage`, `HumanInTheLoop.ask` (with sub-spans for L1 client calls).
    *   **L1 Core Engine Services:** Entry/exit points for API endpoints, internal message processing (e.g., RabbitMQ message consumption), LLM calls, tool execution within L1, database operations.
*   **Context Propagation:** Ensure trace context (trace ID, span ID) is propagated correctly across HTTP headers, WebSocket messages, and internal message queues.
*   **Visualization:** Use a tool like Jaeger or Grafana Tempo to visualize traces and identify latency bottlenecks.

## 4. Metrics and Monitoring

Define key metrics for each layer to proactively monitor health and performance.

*   **L1 Core Engine:**
    *   **Performance:** API latency (P90, P99), request rates, message processing times, agent execution duration.
    *   **Resources:** CPU/Memory utilization per service/container, message queue depth, database connection pools.
    *   **LLM Usage:** Token counts (input/output), LLM provider latency, Brain service response times.
    *   **Operational:** Service uptime, error rates, number of active missions/agents.
*   **L2 Assistant SDK:**
    *   SDK method call frequency, `HumanInTheLoop` interaction counts, conversation duration.
    *   `Tool.execute` success/failure rates, average duration per tool type.
    *   Number of active `Conversation` instances.
*   **L3 API Service:**
    *   HTTP request rates, latencies, error rates per endpoint.
    *   WebSocket connection counts.
    *   CPU/Memory utilization.
*   **L3 Frontend (`mcsreact`):**
    *   Page load times, component rendering performance.
    *   User interaction events (clicks, form submissions).
    *   JavaScript error rates.
    *   WebSocket connection status.
*   **Collection & Visualization:** Use Prometheus for metric collection and Grafana for dashboards and alerting.

## 5. Error Reporting and Alerting

A centralized and intelligent error management system.

*   **Centralized Logging:** Aggregate all ERROR/CRITICAL level logs into a central system (e.g., Sentry, ELK stack).
*   **Rich Context:** Ensure error reports include:
    *   Full stack trace.
    *   Correlation IDs (Mission ID, Request ID, User ID).
    *   Relevant application state (e.g., current step data, tool arguments).
    *   Environment details.
*   **Alerting:** Configure alerts for:
    *   Spikes in error rates.
    *   Critical service failures.
    *   Performance degradations (e.g., P99 latency exceeding thresholds).
    *   `HumanInTheLoop` timeouts.

## 6. Agent/Mission Specific Observability

Beyond general system health, specific insights into agent behavior are needed.

*   **Mission Graph Visualization:** A UI component (in `mcsreact`) to visualize the agent's plan, showing steps, dependencies, status, and tool calls.
*   **LLM Interaction Logs:** Store and visualize the exact prompts sent to the `Brain` (LLM) and its raw responses (with PII redacted). This is crucial for debugging agent reasoning.
*   **Agent State Snapshots:** Periodically capture and log the key internal state variables of an agent to understand its decision-making process.
*   **Tool Input/Output Logging:** Log the arguments passed to tools and the results received, linked via trace IDs.

## 7. Debugging Strategies

*   **Local Development:** Provide simplified `docker-compose` setups with verbose logging for easy local debugging.
*   **Remote Debugging:** Enable remote debugging capabilities (e.g., VS Code debugger attached to Node.js/Python processes) for L1 and L3 API services.
*   **Frontend Debugging:** Utilize browser developer tools for `mcsreact`, with source maps enabled for TypeScript code.
*   **Test Environments:** Ensure all telemetry and debugging tools are fully deployed and configured in staging/test environments.

---

Implementing this comprehensive telemetry and debugging strategy will be instrumental in developing, optimizing, and maintaining the complex v2 architecture, especially as we move towards building more sophisticated collaborative assistants.