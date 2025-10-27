All code in our system is production-ready, efficient, and scalable. We never use placeholders, stubs, or mocks in our code. Nor do we leave TODO items in place of working code. All data and state issues are to be resolved within the code, not thrown unless a higher level of scop is needed - and then they are handled there. Our system is intended to grow through the development of new plugins and discovery of available tools. The core capabilitiesManager executes Steps as requested by the agent. The ACCOMPLISH actionVerb is intended to determine how to achieve a mission or step objective by providing an LLM generated answer, creating a new plan of steps or recommending the development of a new plugin for mechanical task likely to repeat.

### Hierarchy of Work Units

To ensure clarity and consistency in how we define and manage work, the following hierarchy of work units is established:

*   **Mission:** The highest-level, overarching objective or ultimate goal that the entire agent system is tasked to achieve. It defines the complete scope of work.
*   **Stage:** A major segment of a Mission, representing a significant milestone or a distinct, often sequential, phase of work. Stages are particularly useful for structuring complex missions, akin to phases in a waterfall project. A Mission can comprise multiple Stages.
*   **Phase:** A logical grouping of related Tasks within a Stage (or directly within a Mission for more agile or iterative plans). Phases represent a coherent set of activities designed to achieve a specific intermediate outcome or deliverable. A Stage can contain multiple Phases, and a Phase encompasses one or more Tasks.
*   **Task:** A coherent, self-contained unit of work aimed at producing one logical, tangible output or outcome. A Task consists of one or more Steps and represents a meaningful chunk of work that, when completed, directly contributes to the Phase's objective. Tasks are the primary units for which a specialized agent might take ownership.
*   **Step:** The smallest, atomic unit of work that an agent can execute. A Step typically corresponds to a single `actionVerb` (plugin call) with specific inputs and expected outputs. A Task is composed of one or more Steps.

All code must be production ready - no mocks, stubs, simulations. All data and state issues are resolved in the system, not thrown as errors. Unknown verbs are expected and permitted in plans. We develop for classes and generalizations, not hardcoding for very specific items or for this particular mission from the test run. We do not create default values for missing data - we find the reason it is missing.

Never make assumptions or short cut an analysis because you think you know what it is likely to tell you. Confirm assignments. When asked about the project/code - check the project/code. Verify the validity of your understanding about this project.

## Robustness and External Dependencies

- **External API Interactions:** When interacting with external APIs, always implement comprehensive error handling, including retries with exponential backoff for transient errors (e.g., network issues, temporary service unavailability, rate limiting).
- **Rate Limiting:** Design plugins and services to gracefully handle rate limits imposed by external APIs. Do not crash or throw unhandled errors; instead, implement intelligent retry mechanisms and, where applicable, switch to alternative providers or degrade gracefully.
- **Fallback Mechanisms:** For critical functionalities relying on external services (e.g., search, data retrieval), implement robust fallback strategies. If a primary service fails or becomes unavailable, automatically attempt to use alternative providers or internal mechanisms to ensure continued operation, even if with reduced performance or scope.
- **Dependency Stability:** Ensure that critical internal services (like Security Manager, Brain, Librarian) are stable and highly available. Failures in these core services will cascade and impact mission success.
- **Plan Validation Error Handling:** Plan validation should not throw exceptions for data or state issues like type mismatches (e.g., boolean to string) or non-existent outputs. Instead, the validator should attempt to automatically repair these issues (e.g., by inserting TRANSFORM steps for type conversions, or by logging warnings and attempting to proceed with reasonable defaults for missing outputs) and continue the planning process. The system should prioritize graceful degradation and self-correction over hard failures.

## Planning Code Awareness of External Tools

- **ACCOMPLISH and REFLECT Plugins:** The planning code within the ACCOMPLISH and REFLECT plugins must be fully aware of all active and cleared MCP tools and OpenAPI tools. This includes leveraging the enhanced tool discovery and context-aware search capabilities provided by the Librarian service to ensure optimal tool selection and utilization in generated plans.

## Plugin Guidance Principles
- **Verb-Specific Guidance Location:** Plugin or verb specific guidance belongs in the manifest for that plugin, not the general prompts in our planning functions (e.g., ACCOMPLISH or REFLECT).