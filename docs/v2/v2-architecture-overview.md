# V2 Architecture Overview

This document outlines the 3-layer architectural model for the v2 effort. The goal is to create a reusable foundation for building a portfolio of specialized, collaborative AI assistants.

## Layer 1: The Core Orchestration Engine (The "stage7 OS")

-   **Description:** The existing microservices backend (`AgentSet`, `MissionControl`, `Brain`, etc.).
-   **Role:** A powerful, reliable, "headless" executor of abstract plans.
-   **Principle:** This layer is stable and unaware of specific product verticals.

## Layer 2: The "Assistant SDK" (The Reusable Foundation)

-   **Description:** A new, code-first SDK (TypeScript/JavaScript) that provides high-level building blocks for creating assistants.
-   **Role:** To abstract the complexity of the Core Engine and provide a simple, intuitive API for developers.
-   **Core Components:**
    -   `Assistant`: Defines an assistant's identity and capabilities.
    -   `Tool`: A standard wrapper for any capability (e.g., API calls, functions).
    -   `Conversation`: Manages the state and history of user interactions.
    -   `HumanInTheLoop`: Provides functions for agents to request user feedback or approval.

## Layer 3: The Vertical Application (The Use-Case Specifics)

-   **Description:** The final product layer where a specific assistant is built and its UI is defined.
-   **Role:** To combine reusable components from the SDK with domain-specific tools, workflows, and UI elements.
-   **Example:** A "Product Manager Assistant" would bundle `JiraTool` and `ConfluenceTool` and have a specialized UI within the `mcsreact` application for managing roadmaps.
