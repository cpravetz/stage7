All data and state issues are to be resolved within the code, not thrown unless a higher level of scop is needed - and then they are handled there.  Our system is intended to grow through the development of new plugins and discovery of available tools.  The core capabilitiesManager executes Steps as requested by the agent.  The ACCOMPLISH actionVerb is intended to determine how to achieve a mission or step objective by providing an LLM generated answer, creating a new plan of steps or recommending the development of a new plugin for mechanical task likely to repeat.

All code in our system is production-ready, efficient, and scalable.  We never use placeholders, stubs, or mocks in our code.  Nor do we leave TODO items in place of working code.

All code must be production ready - no mocks, stubs, simulations.  All data and state issues are resolved in the system, not thrown as errors.  Unknown verbs are expected and permitted in plans.  We develop for classes and generalizations, not hardcoding for very specific items or for this particular mission from the test run.  We do not create default values for missing data - we find the reason it is missing.

Never make assumptions or short cut an analysis because you think you know what it is likely to tell you.  Confirm assignments. When asked about the project/code - check the project/code.  Verify the validity of your understanding about this project.

## Robustness and External Dependencies

- **External API Interactions:** When interacting with external APIs, always implement comprehensive error handling, including retries with exponential backoff for transient errors (e.g., network issues, temporary service unavailability, rate limiting).
- **Rate Limiting:** Design plugins and services to gracefully handle rate limits imposed by external APIs. Do not crash or throw unhandled errors; instead, implement intelligent retry mechanisms and, where applicable, switch to alternative providers or degrade gracefully.
- **Fallback Mechanisms:** For critical functionalities relying on external services (e.g., search, data retrieval), implement robust fallback strategies. If a primary service fails or becomes unavailable, automatically attempt to use alternative providers or internal mechanisms to ensure continued operation, even if with reduced performance or scope.
- **Dependency Stability:** Ensure that critical internal services (like Security Manager, Brain, Librarian) are stable and highly available. Failures in these core services will cascade and impact mission success.
