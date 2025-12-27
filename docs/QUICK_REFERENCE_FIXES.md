# Quick Reference: Key Code Changes

## 1. Step.ts - Added delegatingAgentId Field

```typescript
// Added field to track which agent delegated this step
public delegatingAgentId?: string;

// In constructor params:
delegatingAgentId?: string;

// In constructor initialization:
this.delegatingAgentId = params.delegatingAgentId;

// In toJSON():
delegatingAgentId: this.delegatingAgentId,
```

## 2. OwnershipTransferManager.ts - Set delegatingAgentId on Transfer

```typescript
public async transferStep(...): Promise<{ success: boolean, error?: string }> {
    const [step] = fromAgent.steps.splice(stepIndex, 1);
    
    step.currentOwnerAgentId = toAgentId;
    step.delegatingAgentId = fromAgentId;  // ← NEW: Track delegating agent
    
    // ... rest of transfer logic
    toAgent.steps.push(step);
    await this.agentSet.updateStepLocation(stepId, toAgentId, this.agentSet.url);
    
    return { success: true };
}
```

## 3. Agent.ts - Fixed Delegation Callback Routing

### Added Fields:
```typescript
// REFLECT cycle detection to prevent infinite loops
private reflectCycleTracker: Map<string, number> = new Map();
private maxReflectCyclesPerError: number = 3;
private lastReflectPlanSignature: string = '';
```

### Updated notifyStepCompletion():
```typescript
private async notifyStepCompletion(step: Step): Promise<void> {
    // Use delegatingAgentId instead of ownerAgentId for proper routing
    if (step.delegatingAgentId && step.delegatingAgentId !== this.id) {
        const delegatingAgent = this.agentSet.agents.get(step.delegatingAgentId);
        if (delegatingAgent) {
            // Pass results back to parent
            delegatingAgent.handleDelegatedStepCompletion(
                step.id, 
                step.status, 
                step.result  // ← NEW: Pass results
            );
        }
    }
}
```

### Enhanced handleDelegatedStepCompletion():
```typescript
public handleDelegatedStepCompletion(
    stepId: string, 
    status: StepStatus, 
    result?: PluginOutput[]  // ← NEW: Accept results
): void {
    if (this.delegatedStepIds.has(stepId)) {
        this.delegatedStepIds.delete(stepId);
        
        // Log results if completed successfully
        if (status === StepStatus.COMPLETED && result) {
            console.log(`Delegated step ${stepId} completed with results:`, 
                result.map(r => `${r.name}=${r.resultDescription}`).join(', ')
            );
        }
    }
}
```

### Added Plan Signature Detection:
```typescript
private _getPlanSignature(plan: ActionVerbTask[]): string {
    const signature = plan.map(step => `${step.actionVerb}`).join('|');
    
    let hash = 0;
    for (let i = 0; i < signature.length; i++) {
        const char = signature.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    
    return `${plan.length}-${hash}`;
}
```

### Added Cycle Detection in _handleReflectionResult():
```typescript
if (newPlan && newPlan.length > 0) {
    // Check for infinite REFLECT cycles
    const planSignature = this._getPlanSignature(newPlan);
    
    if (planSignature === this.lastReflectPlanSignature) {
        const cycleCount = (this.reflectCycleTracker.get(planSignature) || 0) + 1;
        this.reflectCycleTracker.set(planSignature, cycleCount);
        
        // Abort if repeated 3+ times
        if (cycleCount >= this.maxReflectCyclesPerError) {
            console.error(`REFLECT infinite loop detected: Plan repeated ${cycleCount} times.`);
            this.setAgentStatus(AgentStatus.ERROR, { 
                eventType: 'reflect_infinite_loop_detected', 
                planSignature,
                cycleCount
            });
            return;
        }
    } else {
        // Reset counter for new plan
        this.reflectCycleTracker.clear();
        this.lastReflectPlanSignature = planSignature;
    }
    
    // ... continue with plan execution
}
```

## Data Flow Examples

### Delegation Callback Chain:
```
1. Parent Agent migrates step to Delegating Agent
   - Calls: transferStep(stepId, parentId, delegatingAgentId)
   - Result: step.delegatingAgentId = parentId

2. Delegating Agent executes step
   - Calls: step.execute()
   - Result: step.status = COMPLETED, step.result = [...]

3. Delegating Agent notifies parent
   - Calls: notifyStepCompletion(step)
   - Routes to: parentAgent.handleDelegatedStepCompletion(stepId, status, result)

4. Parent Agent receives callback
   - Updates: delegatedStepIds (removes step)
   - Logs: "Delegated step X completed with results: Y=Z"
   - Effect: Parent can now check if other steps' dependencies are satisfied
```

### REFLECT Cycle Detection:
```
Iteration 1: Plan[ACCOMPLISH, SEARCH] → Signature = "2-12345"
            → lastReflectPlanSignature = "2-12345"
            → Cycle Counter = 0

Iteration 2: Plan[ACCOMPLISH, SEARCH] → Signature = "2-12345"
            → Matches lastReflectPlanSignature
            → Cycle Counter = 1
            → Log warning, continue

Iteration 3: Plan[ACCOMPLISH, SEARCH] → Signature = "2-12345"
            → Matches lastReflectPlanSignature
            → Cycle Counter = 2
            → Log warning, continue

Iteration 4: Plan[ACCOMPLISH, SEARCH] → Signature = "2-12345"
            → Matches lastReflectPlanSignature
            → Cycle Counter = 3
            → ABORT: "Infinite loop detected"
            → Agent Status = ERROR
```

## Testing Quick Start

### Test delegatingAgentId tracking:
```typescript
// In test:
const step = new Step({...params, delegatingAgentId: 'parent-id'});
expect(step.delegatingAgentId).toBe('parent-id');
expect(step.toJSON().delegatingAgentId).toBe('parent-id');
```

### Test delegation callback:
```typescript
// Setup:
const delegatingAgent = new Agent(...);
const spyOnCallback = jest.spyOn(delegatingAgent, 'handleDelegatedStepCompletion');

// Execute:
delegatingAgent.notifyStepCompletion(step);

// Verify:
expect(spyOnCallback).toHaveBeenCalledWith(step.id, status, result);
```

### Test cycle detection:
```typescript
// Setup:
const agent = new Agent(...);
const samePlan = [{actionVerb: 'ACCOMPLISH'}, {actionVerb: 'SEARCH'}];

// Execute 3 times:
for (let i = 0; i < 3; i++) {
    agent._handleReflectionResult([...], step);
}

// Verify:
expect(agent.status).toBe(AgentStatus.ERROR);
```

