# FOREACH/REGROUP Dynamic Instance Registration Implementation

## Overview
Implemented the correct FOREACH/REGROUP mechanism where step instances created during FOREACH execution are dynamically registered with their corresponding REGROUP steps, allowing REGROUP to collect results from all instances.

## Changes Made

### 1. createFromPlan() in services/agentset/src/agents/Step.ts (Lines 1775-1826)

**Added Pass 4: REGROUP Instance Registration**

When `createFromPlan()` is called with a FOREACH parent step:
1. Identifies all REGROUP steps in the agent that depend on this FOREACH
2. For each REGROUP, extracts the template step ID from its `stepIdsToRegroup` input
3. Finds all created step instances that match this template ID
4. Registers each matching instance ID in the REGROUP's `tempData` map

```typescript
const registeredKey = `registered_instances_${templateStepId}`;
let registeredInstances = regroupStep.tempData.get(registeredKey) || [];
registeredInstances.push(...matchingInstances.map(inst => inst.id));
regroupStep.tempData.set(registeredKey, registeredInstances);
```

This allows REGROUP to know at runtime which step instances it should wait for and aggregate.

### 2. handleRegroup() in services/agentset/src/agents/Step.ts (Lines 1541-1610)

**Modified to Use Dynamically Registered Instances**

Instead of looking for the template step ID in allSteps (which never executes):
1. Reads `stepIdsToRegroup` as a template identifier
2. Looks up registered instances from `tempData` using the key `registered_instances_${templateId}`
3. Iterates over the actual instance IDs to check their completion status
4. Aggregates results only from the actual instances (not the template)

```typescript
const registeredKey = `registered_instances_${templateStepIds[0]}`;
let instanceStepIds: string[] = [];

if (this.tempData && this.tempData.has(registeredKey)) {
    instanceStepIds = this.tempData.get(registeredKey);
    // ... iterate over instanceStepIds, not templateStepIds
}
```

## How It Works at Runtime

### Plan Validation Time (Python: shared/python/lib/plan_validator.py)
- FOREACH created with subplan containing B → C
- REGROUP created with `stepIdsToRegroup: [C_template_id]`
- REGROUP depends on FOREACH
- External consumers rewired to REGROUP

### Runtime Execution
1. **Step A completes** → produces array
2. **FOREACH triggered** with array input
   - Agent calls `createFromPlan()` with FOREACH as parent
   - Creates B1, B2, B3... and C1, C2, C3... instances
3. **createFromPlan Pass 4 runs**
   - Detects REGROUP steps depending on FOREACH
   - For REGROUP expecting C instances (template ID = C_template_id)
   - Stores `[C1_id, C2_id, C3_id]` in REGROUP's tempData
4. **Step instances execute**
   - B1 → C1, B2 → C2, etc.
5. **REGROUP executes**
   - Retrieves registered instance IDs from tempData
   - Waits for all instances to complete
   - Aggregates their results into array
6. **Step D executes**
   - Receives aggregated array from REGROUP

## Key Properties

- **No template execution**: Template step ID (C_template_id) is never added to allSteps, never executes
- **Instance tracking**: Each FOREACH iteration creates distinct instances that are individually tracked
- **Dynamic population**: REGROUP doesn't know instances until createFromPlan registers them
- **Proper aggregation**: REGROUP collects results from all instances, not template
- **Dependency safety**: Normal step dependencies maintained (C1 depends on B1, etc.)

## Benefits

- Fixes "cancelled" status issue: REGROUP now finds actual instances, not non-existent template
- Correct nesting: FOREACH wraps B and C (subplan), instances created at runtime
- Proper array aggregation: All instance outputs collected into array for downstream consumers
- Clean separation: Template for identification, instances for execution

## Logging

Both implementations include detailed logging:
- createFromPlan logs REGROUP discovery, template matching, and instance registration
- handleRegroup logs instance registration status, completion checking, and waiting states

These logs help diagnose issues in FOREACH/REGROUP execution chains.
