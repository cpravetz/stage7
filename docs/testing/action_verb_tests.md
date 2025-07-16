# Testing Built-in ActionVerb Handlers

This document outlines testing considerations for built-in Step actionVerb handlers, particularly focusing on `ASK`, `WHILE`, and `DELEGATE` as mentioned in the issue.

## `ASK` (ASK_USER_QUESTION Plugin)

The `ASK` actionVerb is handled by the `ASK_USER_QUESTION` plugin within the Capabilities Manager.

**Core Logic (Python Plugin - `plugins/ASK_USER_QUESTION/main.py`):**

*   The plugin receives `question`, optional `choices`, and optional `answerType` as input.
*   It constructs a JSON payload for the `PostOffice` service.
*   It retrieves an auth token.
*   It makes an HTTP POST request to the `/sendUserInputRequest` endpoint of the `PostOffice` service.
*   It returns the response received from `PostOffice` (which should be the user's answer).

**Key areas for testing (mostly integration):**

1.  **Input Handling:**
    *   Test with only a `question`.
    *   Test with `question` and `choices` (as a list).
    *   Test with `question` and `choices` (as a JSON string representing a list).
    *   Test with `question` and various `answerType` values.
    *   Test with missing `question` (should return an error).
2.  **PostOffice Request Formatting:**
    *   Verify the JSON payload sent to `PostOffice` is correctly structured with `question`, `choices` (if any), and `answerType`.
3.  **Authentication:**
    *   Ensure the plugin attempts to get an auth token.
    *   Test behavior if token fetching fails (should result in an error).
4.  **PostOffice Communication:**
    *   **Success Case:** `PostOffice` successfully forwards the request to the frontend, user provides input, and `PostOffice` returns the answer to the plugin's HTTP request. The plugin should then return this answer.
    *   **Error Case (PostOffice unavailable):** If `PostOffice` is down or returns an error, the plugin should report this failure.
    *   **Timeout Case:** If the `PostOffice` request times out (e.g., user never responds), how does the plugin handle this? (Current timeout is 60s).
5.  **Frontend Interaction (Conceptual - requires end-to-end testing):**
    *   Frontend receives the ASK request via WebSocket.
    *   `UserInputModal` is displayed correctly with the question and choices.
    *   User submits an answer.
    *   The answer is correctly sent back through the WebSocket to `PostOffice`.
    *   The `ASK_USER_QUESTION` plugin receives the answer.

**Limitations of Unit Testing within Capabilities Manager:**

*   Full end-to-end testing of the `ASK` verb (including frontend interaction and `PostOffice` mediation) is not possible with unit tests solely within the `CapabilitiesManager` codebase.
*   Mocking the `PostOffice` service can test the plugin's request formatting and response handling, but not the actual user interaction flow.

## `WHILE` and `DELEGATE`

**Analysis:**

The `WHILE` and `DELEGATE` actionVerbs are **not** directly implemented or handled as special cases within the `CapabilitiesManager` service (specifically in `executeActionVerb` or `executeActionVerbInternal` methods).

These verbs are typically control flow mechanisms that are interpreted and managed at a higher level of the agent or mission execution system, such as:

*   **Agent's internal plan interpreter:** An agent might have its own logic to handle a `WHILE` loop in a plan, repeatedly executing a sequence of steps (which are then sent to `CapabilitiesManager`).
*   **MissionControl service:** This service, overseeing mission execution, would likely manage `WHILE` loops or `DELEGATE` operations by dispatching appropriate tasks/sub-plans to relevant agents.

**Testing Implications:**

*   **No `CapabilitiesManager` Unit Tests:** It is not feasible to write unit tests for `WHILE` and `DELEGATE` within `CapabilitiesManager` as it does not contain their handling logic.
*   **Integration Tests Required:** Testing for `WHILE` and `DELEGATE` must be performed through integration tests that involve the services responsible for plan interpretation and execution (e.g., `MissionControl`, `AgentSet`). These tests would verify:
    *   **`WHILE`:** Correct loop execution based on conditions, proper execution of child steps, and termination.
    *   **`DELEGATE`:** Correct task assignment to another agent, successful execution by the delegate, and result propagation.

**Recommendation:**

Focus `CapabilitiesManager` testing on the plugins and action verbs it directly manages. For `WHILE`, `DELEGATE`, and the end-to-end flow of `ASK`, comprehensive integration tests should be established in the relevant testing suites for the overall agent system.
