# Placeholder Resolution Fix for Stage7 Agentic Platform

## Problem Summary

The Stage7 agentic platform had a critical issue where agents would get stuck waiting for user input when ASK_USER_QUESTION steps contained unresolved placeholders like `[userPersonas]` instead of the actual data from completed steps.

### Root Cause Analysis

1. **ACCOMPLISH Plugin Issue**: The ACCOMPLISH plugin generated a plan where the ASK_USER_QUESTION step had a static value with placeholder `[userPersonas]` instead of a proper dependency reference to the THINK step that generates user personas.

2. **Missing Dependency Resolution**: The step was created with `"dependencies":[]` instead of having a dependency on the userPersonas output from step 6.

3. **No Placeholder Resolution**: The Agent execution system had no mechanism to resolve placeholders in input values by looking up outputs from completed steps.

4. **Stuck Agent State**: Agents would transition to `waiting_for_user_input` status and never recover because the malformed question was sent to users.

## Solution Implemented

### 1. Added Placeholder Resolution in Agent Execution

**File**: `services/agentset/src/agents/Agent.ts`

Added three new methods to the Agent class:

#### `resolvePlaceholdersInInputs(inputsForExecution: Map<string, InputValue>)`
- Called before executing any step with CapabilitiesManager
- Iterates through all input values and resolves placeholders in string values
- Logs successful placeholder resolutions

#### `resolvePlaceholdersInString(text: string): string`
- Uses regex `/\[([^\]]+)\]/g` to find placeholders like `[userPersonas]`
- Looks up outputs from completed steps using `findOutputFromCompletedSteps()`
- Replaces placeholders with actual values from completed steps
- Warns if placeholders cannot be resolved

#### `findOutputFromCompletedSteps(outputName: string): string | null`
- Searches through completed steps in reverse order (most recent first)
- Looks for matching output names in step results
- Converts results to string representation (handles objects via JSON.stringify)
- Returns null if no matching output found

### 2. Added Proactive Placeholder Detection and Retry

#### `stepHasUnresolvedPlaceholders(step: Step): boolean`
- Checks if a step has placeholders that can now be resolved
- Used to detect when a step was executed too early but can now be retried
- Returns true if any resolvable placeholders are found

#### `retryStepWithResolvedPlaceholders(step: Step): Promise<void>`
- Resets step status to PENDING and clears results
- Clears waiting state from waitingSteps map
- Resumes agent execution to pick up the pending step

#### `checkAndFixStuckUserInput(): Promise<boolean>`
- Public method to check if agent is stuck waiting for user input with unresolved placeholders
- Finds waiting steps and checks for resolvable placeholders
- Automatically retries steps with resolved placeholders
- Returns true if any stuck steps were fixed

### 3. Enhanced User Input Response Handling

**File**: `services/agentset/src/AgentSet.ts`

#### `checkAndFixStuckAgents(): Promise<boolean>`
- Iterates through all agents in the AgentSet
- Calls `checkAndFixStuckUserInput()` on each agent
- Returns true if any agents were fixed
- Handles errors gracefully and continues checking other agents

#### Enhanced USER_INPUT_RESPONSE handling
- When no agent is found waiting for a specific request ID
- Automatically calls `checkAndFixStuckAgents()` to look for stuck agents
- Returns appropriate success/error responses

### 4. Integration Points

#### In `executeActionWithCapabilitiesManager()`
- Added call to `resolvePlaceholdersInInputs()` before executing any step
- Ensures all placeholders are resolved before sending to CapabilitiesManager

#### In step execution result handling
- Added check for `stepHasUnresolvedPlaceholders()` when a step returns `pending_user_input`
- Automatically retries steps with resolved placeholders instead of waiting for user input
- Only waits for user input if placeholders cannot be resolved

## Expected Behavior After Fix

### For New Steps
1. **Automatic Resolution**: Placeholders in input values are automatically resolved before step execution
2. **No Malformed Questions**: ASK_USER_QUESTION steps will have actual data instead of placeholders
3. **Proper Dependencies**: Steps will wait for their dependencies to complete before executing

### For Stuck Agents
1. **Automatic Recovery**: Agents stuck with unresolved placeholders will be automatically detected and fixed
2. **Retry Mechanism**: Steps will be retried with resolved placeholders
3. **State Transition**: Agents will transition from `waiting_for_user_input` back to `running` status

### For User Experience
1. **Meaningful Questions**: Users will see actual data in questions instead of placeholder text
2. **No Stuck States**: System will automatically recover from placeholder-related issues
3. **Continued Execution**: Agents will continue execution after resolving placeholders

## Testing Scenarios

### Scenario 1: New Mission with Dependent Steps
1. Start a mission that includes ASK_USER_QUESTION steps with placeholders
2. Verify placeholders are resolved before execution
3. Verify users see actual data in questions

### Scenario 2: Recovery of Stuck Agents
1. Identify agents stuck in `waiting_for_user_input` status
2. Trigger USER_INPUT_RESPONSE handling (can be done via any user input)
3. Verify stuck agents are automatically detected and fixed
4. Verify agents transition back to `running` status and continue execution

### Scenario 3: Complex Dependencies
1. Create plans with multiple dependent steps
2. Verify placeholders are resolved in correct order
3. Verify no steps execute with unresolved placeholders

## Files Modified

1. **`services/agentset/src/agents/Agent.ts`**
   - Added placeholder resolution methods
   - Enhanced step execution logic
   - Added stuck agent detection and recovery

2. **`services/agentset/src/AgentSet.ts`**
   - Added stuck agent checking for all agents
   - Enhanced USER_INPUT_RESPONSE handling

## Backward Compatibility

- All changes are backward compatible
- Existing functionality is preserved
- New placeholder resolution is additive and doesn't break existing steps
- No changes to external APIs or interfaces

## Performance Considerations

- Placeholder resolution adds minimal overhead to step execution
- Regex matching is efficient for typical input sizes
- Stuck agent checking only runs when USER_INPUT_RESPONSE messages are received
- No continuous polling or background processes added

## Future Improvements

1. **ACCOMPLISH Plugin Enhancement**: Update the ACCOMPLISH plugin to generate proper dependencies instead of placeholders
2. **Dependency Validation**: Add validation to ensure all dependencies are properly defined
3. **Placeholder Syntax**: Consider more sophisticated placeholder syntax with type hints
4. **Caching**: Add caching for frequently resolved placeholders
