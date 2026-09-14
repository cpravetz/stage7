# Agents vs Assistants and Skills vs Tools

## Agents vs Assistants

| Attribute | Agents | Assistants |
|-----------|--------|------------|
| **Definition** | Autonomous entities that execute a specific mission (task or project) from start to finish. | Persistent, stateful virtual representatives that function on the user's behalf across missions, transactions, and services. |
| **Persistence** | Ephemeral — persist only for the life of the mission, then are archived. | Persistent — maintain state and memory across missions and over the long term. |
| **Statefulness** | Stateful during the mission; state is archived after completion. | Continuously stateful — retains context, history, and learned behavior across all interactions. |
| **Capability Scope** | Focused on executing the assigned mission. | Has every ability of an Agent, plus the capacity to orchestrate Agents, trigger missions, and maintain long-term representation. |
| **Relationship to Agents** | Executed and coordinated by Assistants. | Can use, spawn, and delegate to Agents. |
| **Mission Triggering** | Cannot trigger missions. | Can trigger missions, as can Users. |
| **Self-Correction, Reflection, Learning** | Self-correcting, reflective, learning entity. | Self-correcting, reflective, learning entity. |
| **Use Case** | When the user has a general mission that needs to be done — a task or a project. | When the user needs a virtual representative to function on their behalf across missions, transactions, and persisting services. |
| **Power / Scope** | Single-mission actor. | More powerful than an individual Agent — a long-lived orchestrator and representative. |
| **Lifecycle** | Created for a mission, archived when the mission ends. | Long-lived; persists independently of any single mission. |
| **Autonomy** | Autonomous within the bounds of the mission. | Autonomous across missions; proactively represents the user's interests. |
| **Architecture Role** | Mission execution layer. | Persistent user-representation and orchestration layer. |

## Skills vs Tools

| Attribute | Skills | Tools |
|-----------|--------|-------|
| **Definition** | Reusable, composable capabilities that encapsulate a specific function or behavior. | Discrete, low-level interfaces that perform a single atomic action or interact with an external system. |
| **Granularity** | Coarse — bundles multiple related actions or a workflow step (e.g., "Draft Specification" skill). | Fine — single, well-defined operation (e.g., `createJiraIssue`, `searchConfluence`). |
| **Composition** | Composable — skills can be chained, combined, or orchestrated into larger workflows. | Tools can be chained to reach a mission-given end state; they are not usually used in isolation. |
| **Context of Use** | Never used within a mission or process to complete a discrete task. | A means of completing a discrete task within a mission or process; may also be chained toward a broader end state. |
| **Abstraction Level** | Higher — abstracts intent or outcome (what to achieve), not just the mechanism. | Lower — abstracts the mechanism or API call, not the intent. |
| **Reusability** | Reused across multiple Assistants; often domain-aware. | Reused across any Assistant or process that needs that specific external action. |
| **State Management** | May manage internal state, context, or multi-step progression across invocations. | Typically stateless — each invocation is independent and self-contained. |
| **Discovery** | Bound to Assistants by configuration. | Registered in a tool registry; selected explicitly as needed. |
| **Execution Model** | May involve planning, conditional logic, or multi-step execution internally. | Single-shot execution — performs one action and returns a result; can be chained. |
| **Typical Example** | "Onboard User" skill that sends email, creates account, and sets preferences. | `sendEmail`, `createUser`, `setPreference` tools. |
| **Access** | Only Assistants have access to Skills. | Assistants use Tools to perform concrete actions. |
| **Relationship to Agent** | Agents do NOT have access to Skills. | Agents do NOT have access to Skills; Tools are used by Assistants. |
| **Relationship to Assistant** | Assistants select and invoke Skills to achieve higher-level goals. | Assistants select and invoke Tools to perform concrete actions. |
| **Extensibility** | Skills can be extended with custom logic, parameters, and domain rules. | Tools are extended by adding new external integrations or API wrappers. |