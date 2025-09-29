# Custom Output Names Implementation

## Overview

This implementation allows planners to use custom, descriptive output names in plans instead of being forced to use the exact output names defined in plugin `outputDefinitions`. This makes plans more user-friendly and readable while maintaining full functional soundness.

## Changes Made

### 1. Simplified `shared/python/lib/plan_validator.py`

#### Updated `_fix_step_outputs` method (lines 456-473)
- **Before**: Complex validation logic that forced step outputs to match plugin `outputDefinitions` names exactly
- **After**: Simple validation that allows any custom output names chosen by planners

**Key Changes:**
- Removed over-engineered multi-output plugin logic (no plugins actually have multiple outputs)
- Simplified to just log allowed custom names
- Dependency validation ensures references work correctly
- Minimal validation overhead

#### Updated validation call (lines 432-435)
- Simplified comments and removed unnecessary logic
- Focus on allowing custom names rather than "fixing" them

### 2. Fixed Output Name Mapping in `services/agentset/src/agents/Step.ts`

#### Added `mapPluginOutputsToCustomNames` method (lines 969-1002)
- **Purpose**: Maps plugin output names to step-defined custom names when storing results
- **Logic**:
  - For single outputs: Maps to the single custom name defined in step
  - For multiple outputs: Maps by position to custom names
  - Fallback: Returns original plugin names if no custom names defined

#### Updated Step execution (lines 380-386, 849-855)
- **Before**: Stored plugin outputs directly with plugin-defined names
- **After**: Maps plugin outputs to custom names before storing in `step.result`
- **Impact**: Dependency resolution now finds outputs by custom names

## Benefits

### 1. Improved Plan Readability
```json
// Before (forced plugin names)
{
  "outputs": {
    "response": "User's answer",
    "result": "File operation result"
  }
}

// After (descriptive custom names)
{
  "outputs": {
    "userFavoriteColor": "The user's favorite color",
    "colorPreferenceSaved": "Status of saving color preference"
  }
}
```

### 2. Better Dependency Clarity
```json
// Dependencies are now self-documenting
{
  "content": {
    "outputName": "userFavoriteColor",  // Clear what this references
    "sourceStep": 1
  }
}
```

### 3. Enhanced LLM Planning
- LLMs can generate more intuitive, context-appropriate output names
- Plans become self-documenting
- Reduced cognitive load for human plan reviewers

## Functional Soundness Maintained

### 1. Simplified Validation Approach
- ✅ Allows any custom output names chosen by planners
- ✅ Dependencies work correctly - the key requirement
- ✅ Minimal validation overhead
- ✅ No over-engineering for edge cases that don't exist

### 2. Plugin Reality Check
- ✅ Analysis shows virtually all plugins have single outputs
- ✅ Multi-output plugins are rare/non-existent in practice
- ✅ Simplified logic matches actual usage patterns

### 3. Plugin Execution Unchanged
- ✅ Plugins still return `PluginOutput` objects with their defined names
- ✅ Runtime validation unchanged
- ✅ Plugin compatibility checking unchanged
- ✅ Only plan-level naming is affected

## Testing

### Test Results
All tests passed successfully:
- ✅ Plan validation allows custom output names
- ✅ Step execution maps plugin outputs to custom names
- ✅ Dependency resolution works with custom names end-to-end
- ✅ Single and multiple output scenarios work correctly
- ✅ Fallback to plugin names when no custom names defined

### Test Coverage
- Single output plugins (CHAT, FILE_OPERATION) - the common case
- Multiple output plugins with custom name mapping
- Dependency chains with custom output names
- Edge cases (no custom names, missing outputs)
- Complete end-to-end flow validation

## Example Usage

### Before Change
```json
{
  "number": 1,
  "actionVerb": "CHAT",
  "outputs": {
    "response": "User's response (forced name)"
  }
}
```

### After Change
```json
{
  "number": 1,
  "actionVerb": "CHAT", 
  "outputs": {
    "customerFeedback": "Customer's feedback about our product (descriptive name)"
  }
}
```

## Backward Compatibility

- ✅ Existing plans with plugin-defined names continue to work
- ✅ No breaking changes to plugin interfaces
- ✅ No changes to plugin execution or runtime validation
- ✅ Gradual adoption - teams can use custom names when beneficial

## Implementation Notes

### What Changed
- Plan validation logic in `plan_validator.py`
- Logging messages to show both custom and plugin-defined names
- Validation approach from "fix" to "validate"

### What Didn't Change
- Plugin `outputDefinitions` structure
- Plugin execution and `PluginOutput` format
- Runtime output validation
- Plugin compatibility checking
- TypeScript validation logic

## Future Enhancements

1. **Smart Name Suggestions**: LLMs could suggest contextually appropriate output names
2. **Name Validation**: Optional validation that custom names are descriptive
3. **Documentation Generation**: Auto-generate plan documentation using custom names
4. **IDE Support**: Enhanced tooling for plan editing with custom name autocomplete

## Conclusion

This implementation successfully removes the artificial constraint that forced step outputs to match plugin `outputDefinitions` names exactly. The result is more user-friendly, readable plans while maintaining complete functional correctness and backward compatibility.

The system now supports the principle that **plans should be optimized for human understanding**, not just machine execution.
