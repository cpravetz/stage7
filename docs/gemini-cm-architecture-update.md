Stage7 Agent System: Enhanced Architecture for Agency
Table of Contents:

Introduction & Core Principles

Key Architectural Components

2.1. Agent Core

2.2. Planning Engine

2.3. Execution Engine

2.4. Tool Manager & Capability Registry

2.5. Knowledge Base

2.6. User Interaction Subsystem

2.7. Engineer & Operations Interface

Addressing Specific Design Questions

3.1. Plugin Language Support

3.2. Plugins vs. Other Capability Mechanisms

3.3. Separating Plan Steps from Agent Execution Steps

3.4. Enhanced Step Definition

3.5. Result Model and Data Exchange

3.6. User Interaction via Browser

Agent Learning, Tool Discovery, and Creation

4.1. Learning from Experience

4.2. External Tool Discovery (e.g., OpenAPI)

4.3. New Tool Creation (Engineer-Driven)

4.4. Agent-Composed Tools (Learned Reusable Sub-Plans)

Conclusion

1. Introduction & Core Principles
This document outlines a proposed architecture for the Stage7 agent system, designed to enhance agent agency, plan reusability, tool integration, and learning capabilities. The current system's limitation of tightly coupling plan definitions with execution instances is a primary concern this architecture aims to resolve.

Core Architectural Principles:

Modularity & Separation of Concerns: Each component has a distinct responsibility, promoting maintainability and independent development.

Abstraction & Reusability: Plan definitions (Templates) are abstract and reusable. Tools and capabilities are accessed through standardized interfaces.

Extensibility: The system is designed to easily incorporate new tools, plugins, and agent-learned capabilities.

Adaptability & Learning: Agents can learn from past executions, discover new tools, and even compose their own reusable toolsets.

Clear Data Flow: Well-defined interfaces and data models for communication between components.

State Management: Robust tracking of agent, plan, and step states.

2. Key Architectural Components
The proposed architecture consists of the following major components:

![Diagram Sketch: A high-level block diagram showing Agent Core, Planning Engine, Execution Engine, Tool Manager, Knowledge Base, User Interaction Subsystem, and Engineer Interface, with arrows indicating primary interactions. For example, Agent Core receives tasks, interacts with Planning Engine. Planning Engine uses Tool Manager and KB. Execution Engine runs plans using Tool Manager and updates KB. User Interaction talks to Agent Core and Execution Engine. Engineer Interface talks to Tool Manager and KB.]

(Note: A visual diagram would be beneficial here. Imagine blocks for each component with arrows showing data/control flow.)

2.1. Agent Core
Responsibilities:

Manages the overall lifecycle and identity of an individual agent.

Receives high-level goals or tasks (from users or other systems).

Makes strategic decisions:

"What is my current primary goal?"

"Do I need to formulate a new plan, or can I use an existing one?"

"When should I trigger a learning cycle or request new tool discovery?"

Maintains the agent's overarching context and long-term memory references (pointers to KB entries).

Initiates interactions with the Planning Engine to get a plan.

Delegates plan execution to the Execution Engine.

Interacts With: User Interaction Subsystem, Planning Engine, Execution Engine, Knowledge Base.

2.2. Planning Engine
Responsibilities:

Manages Plan Templates:

Stores and retrieves abstract, reusable Plan Templates.

A Plan Template is a blueprint, not a live execution.

It defines a sequence of Abstract Steps, control flow logic (conditions, loops, branches), input parameters for the plan, and expected output parameters.

Plan Generation/Selection:

Given a goal from the Agent Core, it attempts to find a suitable existing Plan Template.

If no suitable template exists, it can decompose the goal into smaller, manageable sub-goals or actionVerbs.

Queries the Tool Manager for capabilities matching these actionVerbs.

Composes a new Plan Template by sequencing these actions, incorporating control flow. This can involve AI planning techniques or heuristic-based approaches.

Plan Validation: Ensures a generated or selected Plan Template is logically sound (e.g., dependencies met, parameter types compatible).

Interacts With: Agent Core, Tool Manager, Knowledge Base.

2.3. Execution Engine
Responsibilities:

Manages Plan Instances:

When a Plan Template is selected for execution, the Execution Engine creates a Plan Instance. This is a live, stateful execution of the template.

Each Plan Instance has its own unique ID, runtime context (resolved input values, intermediate data), and overall state (Pending, Running, Paused, Succeeded, Failed).

Manages Step Instances:

For each Abstract Step in the Plan Template, a corresponding Step Instance is created within the Plan Instance.

Each Step Instance tracks its own state (Pending, WaitingForDependency, ReadyToRun, Running, Succeeded, Failed, Retrying), resolved input values, actual output values (Results), execution logs, and error information.

Handles dynamic creation of Step Instances for loops defined in the Plan Template (e.g., a loop iterating 5 times over Abstract Step "A" would create 5 distinct Step Instances of "A").

Orchestrates Step Execution:

Resolves dependencies between Step Instances based on the Plan Template's definition.

Invokes the appropriate tool/plugin via the Tool Manager for each ready Step Instance.

Manages the data flow, passing outputs from one Step Instance as inputs to dependent Step Instances.

Handles runtime control flow (e.g., evaluating conditions for branches).

State Management: Persists and updates the state of Plan Instances and Step Instances, often in conjunction with the Knowledge Base.

Interacts With: Agent Core, Tool Manager, Knowledge Base, User Interaction Subsystem (for progress updates, user intervention).

2.4. Tool Manager & Capability Registry
Responsibilities:

Registers and Manages Tools/Capabilities:

Internal Plugins: Custom code modules.

External Tools: Services accessible via APIs (e.g., discovered through OpenAPI specifications, manually configured).

Agent-Composed Tools: Reusable sub-plans that have been promoted to "tool" status (see Section 4.4).

Tool Abstraction Layer: Provides a consistent interface for the Execution Engine and Planning Engine to discover and invoke tools, regardless of their underlying implementation (e.g., local function call, HTTP request, container execution).

Capability Matching: Allows querying for tools based on actionVerb, semantic descriptions, input/output signatures, or other metadata.

Tool Discovery Engine: (Optional but powerful) Actively searches for and ingests definitions of external tools (e.g., by scanning OpenAPI registries).

Version Management: Handles different versions of tools/plugins.

Interacts With: Planning Engine, Execution Engine, Engineer & Operations Interface, Knowledge Base (for storing tool metadata and performance).

2.5. Knowledge Base (KB)
Responsibilities:

Centralized repository for persistent information.

Stores:

Plan Templates: Including metadata, version history, performance metrics (success rates, average execution time).

Tool & Plugin Definitions: actionVerbs they handle, input/output schemas, invocation details, reliability scores, usage patterns, preconditions, effects.

Execution History: Detailed logs of Plan Instances and Step Instances (inputs, outputs, states, timestamps, errors). This is crucial for learning.

Learned Heuristics & Models: For planning, tool selection, error recovery.

User Preferences & Feedback.

Environmental State Models: (If applicable) Representations of the external world the agent interacts with.

Technology: Can be a combination of:

Relational Database (e.g., PostgreSQL): For structured data like Plan Templates, execution logs, tool metadata.

Graph Database (e.g., Neo4j): For representing complex relationships between goals, plans, steps, tools, and concepts.

Vector Database (e.g., Pinecone, Weaviate): For semantic search over tool descriptions, plan goals, or user queries.

Document Store (e.g., MongoDB): For flexible schemas, especially for step inputs/outputs.

Interacts With: All other components.

2.6. User Interaction Subsystem
Responsibilities:

Provides the interface for users to interact with agents.

Backend (UI Gateway):

Exposes APIs (e.g., RESTful, GraphQL) for the frontend.

Handles user authentication and authorization.

Manages WebSocket connections for real-time updates.

Routes user requests to the Agent Core or Execution Engine.

Frontend (Browser-based Application):

Allows users to define goals, submit tasks, and provide inputs.

Visualizes Plan Templates and active Plan Instances (step progress, states, logs).

Displays results and outputs.

Facilitates dialogues: allows agents to ask clarifying questions or request decisions from the user during plan execution.

Provides dashboards for monitoring agent activity and performance.

Interacts With: Agent Core, Execution Engine, Knowledge Base (for user profiles/preferences).

2.7. Engineer & Operations Interface
Responsibilities: (Can be a specialized section of the main UI or a separate application)

Plugin Management: UI for engineers to register new plugins, define their actionVerbs, input/output schemas, and provide executable code or endpoints.

External Tool Configuration: Interface to add/manage OpenAPI specifications, API keys, and other descriptors for external tools.

Knowledge Base Management: Tools for inspecting, curating, and managing data in the KB (e.g., reviewing learned Plan Templates, approving agent-composed tools).

Monitoring & Debugging: Advanced views into agent logs, plan execution traces, and system health.

System Configuration: Managing global settings for the agent platform.

Interacts With: Tool Manager, Knowledge Base, Planning Engine, Execution Engine.

3. Addressing Specific Design Questions
3.1. Plugin Language Support
Primary Recommendation: Python.

Pros: Rich ecosystem for AI/ML, scripting, web integration. Large developer pool. Easy to embed or call.

Polyglot Support via Containerization (Recommended for flexibility):

Allow plugins to be written in any language by packaging them as Docker containers.

The Tool Manager would be responsible for:

Managing these container images.

Running a container for a specific plugin when needed.

Communicating with the plugin inside the container via a standardized interface (e.g., a simple HTTP API exposed by the plugin on a specific port, or gRPC).

Each containerized plugin must include a manifest file (e.g., plugin_manifest.yaml or json) declaring its:

actionVerb (or a list of verbs it handles).

Detailed input parameter schemas (name, type, description, required).

Detailed output parameter schemas.

Instructions on how to run/invoke it (e.g., HTTP endpoint within the container, command-line arguments).

Resource requirements (optional).

Direct Integration (for specific languages):

For tightly coupled or high-performance plugins, you might offer native SDKs in languages like Java or C++ if your core agent system is built in them. However, this adds complexity.

Conclusion: Start with Python for ease of development. Introduce containerization early to enable polyglot plugins without overcomplicating the core Tool Manager.

3.2. Plugins vs. Other Capability Mechanisms
Plugins are a valid and important way to add functionality, especially for bespoke logic specific to your domain or requiring deep integration. However, they should not be the only way.

Internal Plugins:

Pros: Full control, optimized for your system, secure (if developed in-house).

Cons: Development effort, limited to your team's capacity.

External Tool Integration (e.g., via OpenAPI):

Pros: Leverages vast existing functionality, reduces development burden, access to specialized services (payment, weather, translation, etc.).

Cons: External dependencies, API changes, costs, security considerations for data transfer.

Agent-Composed Tools (Learned Sub-Plans):

Pros: Dynamically created, tailored to observed needs, promotes higher-level abstraction.

Cons: Complexity in learning and validating these compositions.

Direct Code Execution (Sandboxed):

For very simple, dynamic tasks, agents might generate and execute small snippets of code (e.g., Python, JavaScript) in a highly sandboxed environment. This is advanced and carries security risks if not implemented carefully.

Recommendation: A hybrid approach is best.

Use internal plugins for core, proprietary functionalities.

Aggressively pursue external tool integration via the Tool Manager (OpenAPI is a great start).

Develop the capability for agents to compose and register their own tools (reusable sub-plans).

3.3. Separating Plan Steps from Agent Execution Steps
This is crucial and is addressed by the distinction between Plan Templates and Plan Instances:

Plan Template Steps (Abstract Steps):

Defined within a Plan Template (stored in the Planning Engine/KB).

Nature: A blueprint or definition.

Content:

A unique ID/label within the template (e.g., step_01_fetch_data).

actionVerb: The general action to perform (e.g., http_get, summarize_text).

inputParameterMappings: Specifies how to get input values (e.g., from the Plan Instance's initial inputs, or from the output of another Abstract Step identified by its ID/label). Example: {"url": "plan.inputs.target_url", "content_to_summarize": "step_01_fetch_data.outputs.body"}.

outputParameterDefinitions: Names and expected types of outputs this step will produce.

toolHints (optional): Suggestions for specific tools, but the Execution Engine might override.

Control flow directives (e.g., nextStep, conditional branches onSuccess: step_X, onFailure: step_Y, loop iterators).

Reusability: Highly reusable. The same Abstract Step definition is part of a template used many times.

Plan Instance Step Instances (Concrete Steps):

Created by the Execution Engine when a Plan Template is instantiated.

Nature: A live, stateful, unique execution of an Abstract Step.

Content:

A globally unique stepInstanceId.

Link to the planInstanceId it belongs to.

Link to the abstractStepId from the Plan Template it instantiates.

state: Pending, WaitingForDependency, ReadyToRun, Running, Succeeded, Failed, Retrying, UserInterventionRequired.

resolvedInputValues: The actual data values fed into the step.

result: The actual output data (or error information) produced after execution.

Timestamps, execution logs, retry count.

Loops: If a Plan Template defines a loop over an Abstract Step "S", the Execution Engine will create multiple, distinct Step Instances of "S", one for each iteration, each with potentially different resolved inputs and its own state and result.

This separation ensures that Plan Templates are static, reusable definitions, while Plan Instances and their Step Instances capture the dynamic, stateful nature of a specific execution.

3.4. Enhanced Step Definition (for Abstract Steps in Plan Templates)
Your current actionVerbs, InputParameters, and OutputParameters are a good start. Enhance them as follows:

# Example Abstract Step Definition in a Plan Template (Conceptual YAML)
id: process_customer_order
actionVerb: processOrder # Semantic verb
description: Validates and processes a new customer order.

# Input Parameters with Schemas and Mappings
inputParameters:
  - name: orderDetails
    description: The customer's order information.
    schema: { type: object, properties: { customerId: {type: string}, items: {type: array} } } # JSON Schema
    source: plan.inputs.newOrder # Where to get this value from
  - name: paymentToken
    schema: { type: string }
    source: step_validate_payment.outputs.token

# Output Parameters with Schemas
outputParameters:
  - name: processingStatus
    schema: { type: string, enum: ["processed", "failed", "pending_manual_review"] }
  - name: confirmationId
    schema: { type: string }

# Control Flow & Dependencies
dependsOn: [ "step_validate_payment", "step_check_inventory" ] # IDs of other abstract steps
onSuccess:
  nextStep: step_notify_customer
onFailure:
  nextStep: step_escalate_issue
  # or: retryPolicy: { maxAttempts: 3, backoffSeconds: 60 }

# Tooling & Execution Hints
toolHints:
  - preferredTool: "internalOrderProcessorPlugin_v2"
  - category: "order_processing"
timeoutSeconds: 300

# Preconditions & Postconditions (Effects) - for advanced planning/validation
preconditions: # Conditions that must be true in the plan instance context
  - context.inventory_service_status == "online"
effects: # Expected changes to context or external state
  - context.order_status_updated = true

Key Enhancements:

Parameter Schemas: Use JSON Schema (or similar) for robust validation and type definition of inputs/outputs.

Explicit Source Mapping for Inputs: Clearly define where each input value comes from (plan inputs, other step outputs).

Control Flow Directives: dependsOn, onSuccess, onFailure, retryPolicy.

Tool Hints: Suggestions for the Execution Engine.

Timeouts: Prevent runaway steps.

Preconditions/Effects (Advanced): Useful for more sophisticated planning and state verification. These describe the state of the world before the step can run, and the expected state after it runs successfully.

3.5. Result Model and Data Exchange
The Result object produced by each Step Instance is critical.

// Conceptual TypeScript interface for a Step Instance Result
interface StepInstanceResult {
  stepInstanceId: string;
  status: 'Success' | 'Failure' | 'UserInterventionRequired';
  outputs?: { // Present if status is Success
    [parameterName: string]: any; // Values should conform to outputParameter schemas
  };
  error?: { // Present if status is Failure
    errorCode: string;
    message: string;
    details?: any; // Stack trace, etc.
  };
  interventionPrompt?: { // Present if status is UserInterventionRequired
    messageToUser: string;
    responseOptions?: any[]; // e.g., buttons, input fields
  };
  executedAt: Date;
  durationMs: number;
  logs?: string[]; // Or structured log entries
}

Data Exchange within a Plan Instance:

The Execution Engine maintains a Plan Instance Context. This is a data structure (e.g., a nested dictionary or a more formal context object) associated with each active Plan Instance.

When a Step Instance completes successfully, its outputs (from the StepInstanceResult) are merged into the Plan Instance Context, typically namespaced by the Abstract Step's ID or a defined alias.

Example: planInstanceContext.step_01_fetch_data.outputs.body = "..."

Before executing a new Step Instance, the Execution Engine uses the inputParameterMappings from its Abstract Step definition to resolve actual input values by looking them up in the Plan Instance Context.

Example: If Abstract Step "B" needs input foo from Abstract Step "A"'s output bar, the mapping would be {"foo": "step_A.outputs.bar"}. The engine fetches planInstanceContext.step_A.outputs.bar.

This ensures that data flows correctly between dependent steps within a single plan execution.

3.6. User Interaction via Browser
This involves the User Interaction Subsystem:

Backend (UI Gateway):

RESTful/GraphQL API: For standard CRUD operations on agents, plans, tasks, and for submitting new goals.

POST /agents/{agentId}/tasks (Payload: goal description, initial inputs)

GET /planInstances/{planInstanceId}/status

GET /planInstances/{planInstanceId}/steps/{stepInstanceId}/result

WebSockets: For real-time, bidirectional communication:

Server -> Client:

Plan Instance status updates (e.g., plan_started, step_running, step_succeeded, plan_completed).

Step Instance progress/logs.

Requests for user input/clarification when a step reaches UserInterventionRequired state (e.g., "Which of these options do you prefer?", "Please provide the missing API key.").

Client -> Server:

User responses to agent prompts.

Commands like pause/resume/cancel Plan Instance.

Frontend (Browser Application - e.g., React, Vue, Angular):

Task Submission: Forms for users to define goals and provide initial parameters.

Dashboard/Monitoring:

Lists active and past Plan Instances.

Visualizes Plan Templates and the progress of active Plan Instances (e.g., a graph or list view of steps, their states, and dependencies).

Displays logs and results.

Interactive Prompts: When the agent needs user input, the frontend renders a modal or dedicated UI section to capture the user's response, which is then sent back via WebSocket or an API call.

Plan Template Editor (Optional): For advanced users or engineers to view/create/edit Plan Templates graphically or via a DSL.

Example User Interaction Flow (Agent needs clarification):

Execution Engine runs a Step Instance that results in UserInterventionRequired (e.g., an ambiguous choice).

The StepInstanceResult includes an interventionPrompt.

Execution Engine sends this prompt to the User Interaction Subsystem's UI Gateway.

UI Gateway pushes the prompt via WebSocket to the relevant user's browser session.

Frontend displays the prompt (e.g., "Found two matching products: Product A and Product B. Which one should I proceed with? [Button A] [Button B]").

User clicks a button. Frontend sends the choice back to the UI Gateway.

UI Gateway forwards the response to the Execution Engine.

Execution Engine updates the Plan Instance Context with the user's choice and resumes the plan, possibly marking the interactive step as completed and moving to the next.

4. Agent Learning, Tool Discovery, and Creation
This is where true agency emerges.

4.1. Learning from Experience
The Execution Engine logs detailed data about every Plan Instance and Step Instance execution to the Knowledge Base. This includes:

Goal, chosen Plan Template, all Step Instances (inputs, outputs, tool used, duration, success/failure, error messages).

A Learning Module (can be part of Agent Core or a separate service) periodically analyzes this data in the KB:

Plan Template Optimization: Identify which Plan Templates are most successful, fastest, or most resource-efficient for specific types of goals. Adjust rankings or suggest modifications.

Tool Performance Analysis: Learn the reliability, speed, and common failure modes of different tools/plugins for specific actionVerbs and input patterns. This can inform the Tool Manager's selection heuristics.

Failure Pattern Recognition & Recovery: Identify common sequences of failures and learn or suggest recovery strategies (e.g., "If Tool X fails with error Y, try Tool Z as a backup"). These can become new Plan Templates or branches in existing ones.

Parameter Adaptation: Learn optimal default values or constraints for certain parameters based on past successes.

4.2. External Tool Discovery (e.g., OpenAPI)
The Tool Manager can have a Discovery Service:

Engineers provide a list of OpenAPI specification URLs or access to a private/public API registry.

The Discovery Service periodically fetches and parses these specifications.

For each API endpoint, it attempts to:

Map the operation to one or more actionVerbs (this might require some heuristics, NLP, or engineer annotation).

Extract input parameter schemas (from request body, path/query params).

Extract output parameter schemas (from response bodies).

Determine authentication requirements.

Successfully parsed tools are registered in the Tool Manager's capability registry, making them available to the Planning Engine.

Human oversight/validation might be needed for newly discovered tools before they are widely used.

4.3. New Tool Creation (Engineer-Driven)
Gap Identification: The Planning Engine, Agent Core, or even analysis of user requests might identify a recurring need for a capability (an actionVerb) for which no suitable tool exists.

Requirement Specification: This need is flagged, potentially with a description, example inputs/outputs, and desired behavior.

Engineer Interface: This requirement is presented to an engineer via the Engineer & Operations Interface.

Development & Registration: The engineer develops a new internal plugin (e.g., Python code, a containerized service) or configures an existing external tool manually.

They then use the Engineer Interface to register this new tool with the Tool Manager, providing its manifest (actionVerb, schemas, invocation details).

4.4. Agent-Composed Tools (Learned Reusable Sub-Plans)
This is a more advanced form of learning and tool creation:

Sub-goal/Pattern Identification: The Learning Module, by analyzing execution histories in the KB, identifies frequently occurring, successful sequences of steps that achieve a common, well-defined intermediate outcome.

Example: A sequence of "download_webpage" -> "extract_text_content" -> "summarize_text_short" might be used often.

Composition Proposal: The agent can propose this sequence as a new, higher-level "Composed Tool" or a "Reusable Sub-Plan Template".

This composed tool would have its own defined actionVerb (e.g., get_webpage_summary), its own input parameters (e.g., url), and output parameters (e.g., summary).

Validation & Registration:

This proposal might require engineer review and approval via the Engineer Interface, especially in early stages.

Alternatively, with high confidence, the agent might automatically register it.

The Composed Tool is essentially a new Plan Template, but it's registered in the Tool Manager as if it were a single capability.

Usage:

The Planning Engine can now use this get_webpage_summary actionVerb as if it were a primitive tool.

When the Execution Engine encounters this composed tool, it effectively executes the underlying sub-plan (instantiating its sequence of steps).

This allows agents to build up a library of increasingly abstract and powerful capabilities from simpler ones, significantly enhancing their problem-solving efficiency and adaptability.

5. Conclusion
This proposed architecture provides a more robust, flexible, and intelligent foundation for your Stage7 agents. By clearly separating plan definitions (Templates) from their execution (Instances), and by establishing well-defined components for planning, execution, tool management, knowledge storage, and user interaction, the system gains:

Reusability: Plans are abstract blueprints.

Extensibility: New tools and plugins (in various languages via containerization) can be easily added. External APIs can be readily integrated.

Agency & Learning: Agents can learn from experience, discover new tools, and even create their own reusable composed tools.

Clarity: Improved understanding of system behavior and easier debugging.

Implementing such an architecture is a significant undertaking, but the benefits in terms of agent capability and system maintainability will be substantial. It's recommended to approach this iteratively, building out core components first and then progressively adding more advanced features like automated tool discovery and agent-composed tools.