# Plan Validation Fix - Removed Internal Metadata from Plans

## The Disease: Schema-Violating Internal Fields

The `plan_validator.py` was adding internal tracking fields to plan steps that:
1. **Violated the PLAN_STEP_SCHEMA** - Fields like `_metadata`, `scope_id`, `recommendedRole` (in certain places) don't belong in serialized plans
2. **Made plans non-JSON-compatible** - When plans were serialized with json.dumps() and sent between services (JS/TS ↔ Python), these extra fields caused issues
3. **Persisted in output** - The metadata fields were included in returned plans, corrupting them for downstream consumers

## Root Issues Fixed

### 1. **_metadata Fields** (Lines 900, 997-1000)
**Before:** Steps were marked with internal tracking:
```python
wrapped_step['_metadata'] = {}
wrapped_step['_metadata']['_wrapped_by'] = 'FOREACH'
wrapped_step['_metadata']['_wrapper_step_id'] = foreach_step_id
```

**After:** Removed all _metadata field assignments. These were internal tracking only and should never be serialized.

### 2. **scope_id Field** (Lines 982, 1029)
**Before:** FOREACH and REGROUP steps had non-schema fields:
```python
"scope_id": scope_id,
"recommendedRole": "Coordinator"  # (only valid at deliverable level)
```

**After:** Removed these fields from FOREACH and REGROUP steps. The scope_id is used internally during validation but never appears in the returned plan.

### 3. **No Sanitization on Return** (Lines 315, 343)
**Before:** Plans were returned with all internal tracking intact.

**After:** Added sanitization at every return point:
- Line 315: When plan is valid, sanitize before returning
- Line 343: When all retries exhausted, sanitize before returning

### 4. **New _sanitize_plan() Method** (Lines 235-283)
**Added:** Complete sanitization method that:
- Removes all non-schema fields from steps
- Whitelists only valid fields: `id`, `actionVerb`, `description`, `inputs`, `outputs`, `recommendedRole`
- Recursively sanitizes nested inputs/outputs
- Whitelists valid input fields: `value`, `valueType`, `outputName`, `sourceStep`, `args`
- Whitelists valid output fields: `description`, `type`, `isDeliverable`, `filename`

## Guarantee

Every plan returned from `validate_and_repair()` is now guaranteed to be:
✅ Pure JSON-serializable  
✅ Schema-compliant  
✅ Free of internal tracking metadata  
✅ Safe to pass between languages (JS/TS ↔ Python)

## Verification

The FOREACH and REGROUP structures now contain only schema-compliant fields:
```json
{
  "id": "uuid",
  "actionVerb": "FOREACH",
  "description": "...",
  "inputs": {
    "array": {"outputName": "...", "sourceStep": "..."},
    "steps": {"value": [...], "valueType": "array"}
  },
  "outputs": {
    "steps": {"description": "...", "type": "array"}
  }
}
```

No `_metadata`, no `scope_id`, no internal fields.
