# REGROUP Failure Analysis - Stage7 Mission Execution

## Executive Summary
The REGROUP failures stem from **multiple critical issues in the FOREACH/REGROUP transformation logic**:

1. **Wrong output target**: REGROUP steps are collecting `risk_plan` from FOREACH iterations when they should be collecting outputs specific to each iteration
2. **Incorrect step instantiation**: Top-level steps (SEARCH, GENERATE) are being wrapped in multiple nested FOREACH structures that weren't in the original plan
3. **Incorrect source_step_id_in_subplan**: REGROUP steps reference step IDs that don't match the actual nested structure
4. **Duplicate FOREACH wrappers**: The same steps appear in multiple FOREACH blocks at different nesting levels

---

## Problem 1: Wrong Output Collection in REGROUP

### The Issue
All REGROUP steps in the nested structure are trying to collect `risk_plan` from the FOREACH iterator:

```json
REGROUP step ae77dd37-6d69-42a1-b1bb-4a68a0af8250:
{
  "output_to_collect": "risk_plan",
  "source_step_id_in_subplan": "e6a10784-06e0-43fd-9a87-2ae0c9b259c1",  // This step is NOT in the current FOREACH's steps!
  "foreach_results": {
    "sourceStep": "6dd55649-e8f3-4def-8951-8fc689024bd2"
  }
}
```

### Why This Fails
- Step `6dd55649-e8f3-4def-8951-8fc689024bd2` is a FOREACH iterating over `competitors`
- Its inner steps are:
  - `b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e` (GENERATE - user_personas)
  - `d285b4f4-c255-4e17-a06f-3b03fb5e1cf1` (FOREACH)
  - More nested FOREACHes
  
- **REGROUP is looking for `e6a10784-06e0-43fd-9a87-2ae0c9b259c1` (risk_plan generator)** which is nested 6 levels deep, NOT direct child of this FOREACH
- The output `risk_plan` doesn't exist at this FOREACH level; each iteration should collect different outputs based on its depth

### Correct Behavior Should Be
Each REGROUP should collect the **final output of the innermost step in its FOREACH scope**:

```
FOREACH(competitors) should REGROUP → output from step that processes competitors
  ├─ FOREACH(user_personas) should REGROUP → output from step that processes user_personas
      ├─ FOREACH(enhancements) should REGROUP → output from step that processes enhancements
          └─ ... and so on
```

---

## Problem 2: Duplicate Top-Level Step Instances

### The Issue
Steps like `b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e` (GENERATE user_personas) appear **multiple times** in the plan:

1. **First occurrence** (intended): Inside FOREACH `6dd55649-e8f3-4def-8951-8fc689024bd2`
2. **Second occurrence** (incorrect): Inside another FOREACH `32a56890-e37c-409e-959b-5433b3315c0b`
3. **Third occurrence** (incorrect): In the final REGROUP plan generation

### Why This Happens
The plan validation/transformation logic is creating nested FOREACH wrappers **around steps that should only exist once at the top level**. Looking at the log:

```
2025-12-22 14:56:50,913 - INFO [_wrap_step_in_foreach:1044] - Wrapping step 8827e89a-ba1a-4f0d-a1c4-616fab3aef1f in FOREACH for input 'user_personas'
2025-12-22 14:56:50,915 - INFO [_wrap_step_in_foreach:1044] - Wrapping step 3adc5b14-97a7-49fe-bfec-a7d2ad0fb594 in FOREACH for input 'mapped_enhancements'
2025-12-22 14:56:50,917 - INFO [_wrap_step_in_foreach:1044] - Wrapping step 9b92299a-77fb-44ce-8918-689b730c8757 in FOREACH for input 'effort_estimates'
2025-12-22 14:56:50,919 - INFO [_wrap_step_in_foreach:1044] - Wrapping step d923cedc-faac-43d7-abe4-d6b24e3da52a in FOREACH for input 'business_cases'
```

### The Root Cause
The plan validation is **recursively wrapping ALL GENERATE steps that consume outputs from previous steps**, but:

1. It doesn't distinguish between:
   - Steps that genuinely need iteration (those directly consuming iterated outputs)
   - Steps that consume non-iterated inputs and should run once per parent iteration

2. **FOREACH `32a56890-e37c-409e-959b-5433b3315c0b` is redundant**:
   - It iterates over user_personas to generate 10 enhancements
   - But these 10 enhancements are the same for ALL competitors
   - They should be generated ONCE, then each FOREACH(competitors) iteration uses the same enhancements output

3. **Wrong instantiation pattern**: 
   - Expected: FOREACH(competitors) → [GENERATE(personas), FOREACH(personas) → [GENERATE(enhancements), ...]]
   - Actual: FOREACH(competitors) → [GENERATE(personas), FOREACH(personas) → [GENERATE(enhancements), FOREACH(personas again) → [same enhancements step]]]

---

## Problem 3: Incorrect Source Step IDs in Nested REGROUP

### Example from Log
```
FOREACH 764e5ad7-4bb9-42ac-8285-09682236a3ab (iterating over mapped_enhancements):
  ├─ REGROUP 292a6db6-3302-4761-b726-741e7ff26f0a
      └─ source_step_id_in_subplan: "e6a10784-06e0-43fd-9a87-2ae0c9b259c1" (risk_plan)
         output_to_collect: "risk_plan"
```

### Why It Fails
- This FOREACH is iterating over `mapped_enhancements`
- The step IDs it contains are enhancement-related (effort estimates, business cases, engineering prompts)
- **It's trying to collect `risk_plan` which doesn't exist in this scope**
- The step ID `e6a10784...` is inside 2-3 nested FOREs deeper, not in this FOREACH's direct children

### The Pattern
Every REGROUP is hardcoded to look for the **deepest-nested step's output** (`risk_plan`), regardless of what FOREACH it's in. This is fundamentally wrong.

---

## Problem 4: Step Cancelled But Success:true

### Observed in Log
```json
{
  "id": "f5d473f7-bdde-4b4b-ba89-eb64e3b376b1",
  "actionVerb": "GENERATE",
  "description": "Map enhancements to user personas and pain points.",
  "status": "cancelled",
  "result": [
    {
      "success": true,
      "name": "mapped_enhancements",
      "resultType": "string",
      "result": "Based on existing knowledge, I will create a hypothetical system and personas..."
    }
  ]
}
```

### Why This Happens
1. **Steps are marked "cancelled"** because they were removed from the final plan structure during REGROUP failure
2. **But they had already executed** and stored results before the transformation error occurred
3. The execution tracker shows `success: true` (the step DID complete execution), but the **plan structure rejection** marks it as cancelled
4. This creates the confusing state: "cancelled but success:true"

### Implications
- These steps DID run and generate outputs
- But those outputs are **orphaned** because the REGROUP couldn't properly connect them to dependents
- The outputs aren't available to downstream steps due to the broken FOREACH/REGROUP structure

---

## Root Cause: FOREACH Transformation Logic

The issue is in `_transform_plan_recursive` and `_wrap_step_in_foreach`:

### Current Logic (Broken)
```
For each step that has a dependency on a FOREACH output:
  - Create a new FOREACH wrapping that step
  - Place it immediately after the source FOREACH
  - Recursively apply the same logic to steps inside the new FOREACH
  
Result: Multiple nested FOREACH layers for the same iteration path
```

### What Should Happen
```
For steps with dependencies:
  - Check if they depend on ARRAY outputs (need iteration) or SCALAR outputs (no iteration)
  - If ARRAY: wrap in FOREACH
  - If SCALAR: reference from parent scope, don't wrap
  - Each FOREACH only wraps steps that actually iterate over ITS output
  - Each REGROUP only collects from direct children of its FOREACH
```

---

## Specific Failures to Fix

### Fix 1: REGROUP Target Validation
**File**: `services/agentset/src/agents/ACCOMPLISH/Step.py` or equivalent plan validation

```python
# CURRENT (WRONG):
source_step_id_in_subplan: "e6a10784..." # Points to deepest nested step
output_to_collect: "risk_plan"

# SHOULD BE:
source_step_id_in_subplan: <actual last step in THIS FOREACH's scope>
output_to_collect: <output from that step, not from 5 levels up>
```

### Fix 2: FOREACH Instantiation
**Each FOREACH should only wrap steps that:**
1. Directly or indirectly depend on THIS FOREACH's iteration output
2. Don't have dependencies on outputs from parallel iterations

**Example:**
- `FOREACH(competitors)` wrapping user_personas generation: ✓ CORRECT
  - Each competitor → generate personas for that competitor
  
- `FOREACH(competitors)` wrapping nested `FOREACH(enhancements)`: ✗ WRONG
  - Enhancements are the same for all competitors, shouldn't be re-generated per competitor
  - This should be generated ONCE before or outside the competitor iteration

### Fix 3: De-duplication
Remove duplicate step instances from nested FOREACH structures. Steps should exist at exactly ONE nesting level in the plan.

### Fix 4: Plan Flattening
Consider flattening the deeply nested FOREACH/REGROUP structure:
- Generate all single-iteration outputs first
- Then only wrap steps that genuinely need per-item iteration
- Keep nesting depth ≤ 2-3 levels maximum

---

## Recommended Investigation Points

1. **Check `_wrap_step_in_foreach` function**:
   - Why is it wrapping steps multiple times?
   - Is it checking `scope_id` correctly?
   - Should it skip wrapping if step is already in a FOREACH?

2. **Check `_apply_uuid_map_recursive`**:
   - Are sourceStep references being updated correctly when wrappers are added?
   - Is it preserving the correct relationship between FOREACH and its target steps?

3. **Check REGROUP target step detection**:
   - How is `source_step_id_in_subplan` being determined?
   - Should it be the last step in current scope, not the global deepest step?

4. **Check step deduplication**:
   - Are steps being copied/cloned when added to multiple FOREACH scopes?
   - Should there be a check to prevent the same step appearing in multiple FOREACH blocks?

---

## Expected vs Actual Plan Structure

### Expected (What Should Happen)
```
├─ SEARCH (competitors)
├─ FOREACH(competitors) [1 iteration per competitor]
│  ├─ GENERATE (personas)
│  ├─ FOREACH(personas) [1 iteration per persona]
│  │  ├─ GENERATE (enhancements)
│  │  └─ REGROUP → collect enhancements
│  ├─ REGROUP → collect personas' enhancement results
│  └─ GENERATE (business cases from enhancements) [runs once per competitor]
└─ ... final steps
```

### Actual (What's Happening)
```
├─ SEARCH (competitors)
├─ FOREACH(competitors) [1 iteration]
│  ├─ GENERATE (personas)
│  ├─ FOREACH(personas) [nested]
│  │  ├─ GENERATE (enhancements)
│  │  ├─ FOREACH(personas again???) [duplicate nesting]
│  │  │  ├─ GENERATE (enhancements again)
│  │  │  ├─ FOREACH (nested deeper)
│  │  │  └─ REGROUP looking for "risk_plan" [WRONG OUTPUT]
│  │  └─ REGROUP looking for "risk_plan" [WRONG OUTPUT]
│  └─ REGROUP looking for "risk_plan" [WRONG OUTPUT]
```

---

## Impact on Execution
- **FOREACH creates subplans**: Multiple iterations of the same steps should generate arrays of results
- **REGROUP should collect**: Take arrays from iterations and flatten into single consolidated array
- **Current failure**: REGROUP can't find its target outputs due to:
  - Wrong nesting depth (looking for step in wrong scope)
  - Wrong output name (looking for risk_plan when it should look for current iteration's output)
  - Duplicate steps causing ambiguous resolution

This causes the steps to be **cancelled** because they're unreachable in the final execution plan, despite having executed during validation.

