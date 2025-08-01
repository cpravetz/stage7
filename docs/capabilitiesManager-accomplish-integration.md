# CapabilitiesManager Integration for ACCOMPLISH Plugin

## Requirements
- Distinguish between mission goal planning and novel actionVerb handling.
- Pass correct input structure to ACCOMPLISH plugin:
  - Mission: `[["goal", {value: <goal>, valueType: "string"}]]`
  - Novel actionVerb: `[["novel_actionVerb", {...}]]`
- Parse and handle all result types: `plan`, `plugin`, `direct_answer`, `error`.
- Add robust error handling and logging for plugin invocation and result parsing.

## TypeScript Integration (Pseudo-patch)

```typescript
// In executeActionVerb or similar:
if (step.actionVerb === 'ACCOMPLISH') {
  let accomplishInput: any[];
  if (step.inputValues.has('goal')) {
    accomplishInput = [["goal", step.inputValues.get('goal')]];
  } else if (step.inputValues.has('novel_actionVerb')) {
    accomplishInput = [["novel_actionVerb", step.inputValues.get('novel_actionVerb')]];
  } else {
    // handle error: missing required input
  }
  // Call ACCOMPLISH plugin (Python) with accomplishInput as stdin
  // Parse stdout as JSON
  // Handle result types: plan, plugin, direct_answer, error
  // Add try/catch for plugin invocation and result parsing
}
```

## Error Handling
- Catch and classify errors from plugin invocation and result parsing.
- Return structured error outputs to the caller.

## Next Steps
- Implement this logic in CapabilitiesManager.ts.
- Test with both mission and novel_actionVerb scenarios.
- Ensure all result types are handled and errors are logged/propagated.
