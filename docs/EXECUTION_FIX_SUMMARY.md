# Plan Execution Fix Summary

## Problem Statement
When plans are created by ACCOMPLISH or REFLECT plugins, the resulting steps are "completed" but never actually executed. Users report "52 completed steps and 8 failed steps and none of it actually happens".

## Root Causes Identified

### 1. **FOREACH Returns Wrong Type (FIXED)**
**Status:** COMPLETED ✓

**Issue:** 
- FOREACH's `handleForeach` method creates Step objects using `createFromPlan()`
- Then returns these Step objects in a PluginOutput with `resultType: PLAN`
- Agent.executeStep expects ActionVerbTask[] objects (the plan format)
- When Agent tries to add these Steps to the plan via `addStepsFromPlan`, it fails because createFromPlan expects ActionVerbTask[], not Step[]

**Fix Applied:**
- Modified `Step.handleForeach` (services/agentset/src/agents/Step.ts, lines 1450+) to:
  - Clone the subPlanTemplate tasks (ActionVerbTask[])
  - Inject item/index values directly into the cloned tasks
  - Return the transformed ActionVerbTask[] array instead of Step[] objects
  - This ensures the returned plan can be properly processed by Agent.executeStep

**Impact:** FOREACH subplan steps will now be properly instantiated and added to the agent's step list for execution.

---

### 2. **Plan Execution Verification Needed**
**Status:** NEEDS INVESTIGATION

**Issue:**
- When ACCOMPLISH/REFLECT return a plan with `resultType: "plan"`, Agent.executeStep.should detect this at line 627
- Agent.executeStep has logic to call `addStepsFromPlan()` which adds the plan steps to agent.steps
- **BUT:** Need to verify this actually happens for ACCOMPLISH steps (currently only confirmed for REFLECT)

**Evidence of Correctness:**
- Agent.ts line 627-668 contains proper PLAN result handling
- addStepsFromPlan correctly creates Step objects and registers them
- createFromPlan validates references and builds proper dependency graph

**Potential Issues to Verify:**
- Is the PLAN result being detected correctly? (Check if resultType field matches exactly)
- Are steps being added after ACCOMPLISH is called?
- Are there any exceptions silently caught that prevent step addition?

---

### 3. **Validator May Not Enforce GENERATE 'prompt' Input (TASK #4)**
**Status:** NOT FIXED

**Issue:**
- GENERATE steps require a mandatory 'prompt' input  
- If LLM generates GENERATE without prompt, or with empty prompt, steps will fail
- Validator should enforce this and repair missing prompts

**Location:** `services/capabilitiesmanager/src/plugins/ACCOMPLISH/main.py` line 1043 discusses GENERATE
- But `shared/python/lib/plan_validator.py` doesn't have specific validation for GENERATE's 'prompt' requirement

**Fix Needed:**
- Add special case handling in `_validate_step` for GENERATE action verb
- If 'prompt' input is missing or empty, add to error list
- Brain repair prompt should specifically add or fix the 'prompt' input

---

### 4. **REFLECT Plan Validation (TASK #3)**
**Status:** PARTIALLY VERIFIED

**Good News:**
- REFLECT correctly validates plans using PlanValidator
- PlanValidator follows GEMINI rules:
  - Converts UUIDs
  - Validates required inputs  
  - Checks type compatibility
  - Auto-injects FOREACH for array-to-scalar mismatches
  - Calls Brain to repair invalid plans

**Potential Issue:**
- REFLECT's _summarize_plan_history (lines 463-490) might lose context needed for validation
- But this is only used for Brain context, not for validation itself

---

## Architecture Overview

### Flow for ACCOMPLISH-generated Plans
1. Agent calls ACCOMPLISH plugin with a goal
2. ACCOMPLISH returns PluginOutput[] where:
   - name: "plan"
   - resultType: "plan"  
   - result: ActionVerbTask[] (array of plan steps)
3. Step.execute returns this PluginOutput[]
4. Agent.executeStep detects resultType === "plan"
5. Agent.executeStep calls addStepsFromPlan(plan, step)
6. addStepsFromPlan calls createFromPlan() to convert ActionVerbTask → Step
7. createFromPlan validates all references and creates Step objects
8. Steps are added to agent.steps with proper parentStepId pointing to ACCOMPLISH step
9. Agent's main loop (runAgent) executes these new steps

### Flow for FOREACH Subplan Execution
1. FOREACH step is executed with array and subplan inputs
2. handleForeach creates cloned ActionVerbTask[] (with item/index injected)
3. handleForeach returns PluginOutput with resultType: PLAN and result: ActionVerbTask[]
4. Agent.executeStep detects this and calls addStepsFromPlan
5. createFromPlan creates Step[] for each subplan task
6. Steps maintain parentStepId=FOREACH_STEP_ID for proper scoping
7. Agent executes these steps with item/index values from inputValues

---

## Verification Checklist

- [x] FOREACH returns ActionVerbTask[] not Step[]
- [ ] Verify ACCOMPLISH PLAN results are detected and processed
- [ ] Verify steps added from ACCOMPLISH are actually executed (not just added)
- [ ] Verify FOREACH subplan steps execute with correct item/index values
- [ ] Add GENERATE 'prompt' validation
- [ ] Test end-to-end: Goal → ACCOMPLISH → Plan → Execution → Deliverables

---

## Code References

**Fixed Code:**
- `services/agentset/src/agents/Step.ts` - handleForeach (lines ~1450+)

**Code to Verify:**
- `services/agentset/src/agents/Agent.ts:executeStep` (lines 627-668) - PLAN handling
- `services/agentset/src/agents/Agent.ts:addStepsFromPlan` (lines 775-783) - Step addition
- `services/agentset/src/agents/Step.ts:createFromPlan` (lines 1599+) - Step creation from plan

**Code to Fix:**
- `shared/python/lib/plan_validator.py` - Add GENERATE prompt validation
- `services/capabilitiesmanager/src/plugins/ACCOMPLISH/main.py` - Ensure Brain repairs missing GENERATE prompts

---

## Next Steps

1. **IMMEDIATE:** Test that FOREACH subplan steps now execute properly
2. **URGENT:** Trace ACCOMPLISH plan execution path to confirm steps are being added
3. **IMPORTANT:** Add GENERATE 'prompt' mandatory input validation
4. **VERIFY:** Run end-to-end test mission to confirm deliverables appear

