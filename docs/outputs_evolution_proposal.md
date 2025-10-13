# Proposal: Distinguishing Interim Work Products from Final Deliverables

## 1. Introduction

Currently, the mission outputs or "Shared Files" folder becomes populated with all intermediate work products generated during a plan's execution. This includes temporary files, formatted data for the next step, and partial results. This clutters the user-facing output directory, making it difficult to identify the actual, final deliverables of a mission. The file naming is also generic (e.g., `step_9_prioritizedEnhancements.txt`), lacking user-friendly context.

This proposal outlines a strategy to differentiate between **interim work products** (internal data passed between steps) and **final deliverables** (the polished outputs intended for the user), and to handle each accordingly.

## 2. Analysis of Current State

-   **Indiscriminate Saving:** The current agent logic saves the result of almost every step to a shared file space. While useful for debugging, this is not ideal for user presentation.
-   **Generic Naming:** Files are named programmatically based on their step number and output name, which lacks semantic meaning for the end-user.
-   **Implicit Distinction:** The system uses `outputType` (`Interim`/`Final`) and `scope` (`AgentStep`/`MissionOutput`) in its internal messaging. This is a good starting point but does not currently control what is saved as a user-facing file.

**The core gap is the lack of an explicit mechanism, either defined by the planner or inferred by the system, to identify an output as a final, user-centric deliverable.**

## 3. Proposed Solution: Explicit Deliverable Declaration

To solve this, I propose enhancing the plan schema to allow the planner (the `ACCOMPLISH` LLM) to explicitly declare which outputs are final deliverables.

### 3.1. Schema Enhancement

I propose adding two new optional properties to the `outputs` objects within a plan step:

1.  `isDeliverable` (boolean): When `true`, this flag marks the output as a final deliverable intended for the user.
2.  `filename` (string): A user-friendly filename for the deliverable (e.g., `market_analysis_report.pdf`). This should be provided if `isDeliverable` is true.

**Example Schema:**

```json
{
  "number": 5,
  "actionVerb": "THINK",
  "description": "Analyze market data and generate a final report.",
  "inputs": { ... },
  "outputs": {
    "final_report": {
      "description": "A comprehensive report on market trends.",
      "isDeliverable": true,
      "filename": "2025-market-trends-report.md"
    }
  }
}
```

### 3.2. Planner (LLM) Prompt Enhancement

The system prompt for the `ACCOMPLISH` plugin's planning phase will be updated to instruct the LLM on how and when to use these new properties. The guidance will be:

-   "Identify the key final outputs of the plan that the user will want to see. For these specific outputs, set `isDeliverable` to `true`."
-   "When you mark an output as a deliverable, also provide a descriptive, user-friendly `filename` for it."
-   "Do not mark intermediate outputs that are only used as inputs for subsequent steps as deliverables."

### 3.3. System Implementation Logic

The agent's step execution logic will be updated to handle outputs based on these new properties:

1.  **When a step completes:** The agent will inspect the `outputs` definition for that step in the original plan.
2.  **If `isDeliverable` is `true`:**
    *   The output will be saved to the user-facing **Shared Files** directory.
    *   The system will use the provided `filename`. If the filename is missing, it will fall back to a sanitized version of the output name (e.g., `final_report.txt`).
3.  **If `isDeliverable` is `false` or not present:**
    *   The output will be treated as an **interim work product**.
    *   It will still be saved to the internal, step-specific storage for debugging, chaining, and reflection purposes.
    *   It will **not** be displayed in the primary "Shared Files" UI, thus keeping the user's view clean.

### 3.4. Heuristic Fallback (Backward Compatibility)

For older plans or cases where the LLM fails to use the new properties, we can apply a heuristic as a fallback:

-   **The "Orphan Output" Rule:** An output is automatically promoted to a deliverable if it is not consumed as an `input` by any subsequent step in the plan, with the exception of `REFLECT` steps which are known to consume all outputs for analysis.
-   This provides a safety net to ensure that final results are not missed, even in the absence of explicit declaration.

## 4. Conclusion

This multi-faceted approach combines the intelligence of the LLM planner with a robust system heuristic. It will:
-   De-clutter the user's view of mission outputs.
-   Provide user-friendly filenames for deliverables.
-   Maintain a clear distinction between internal work products and final results.
-   Be backward-compatible by using the heuristic for older plans.

## 5. Detailed Implementation Plan

### 5.1. Understanding Current Architecture

The current system has two distinct output channels:

1. **Results Tab (Work Products)**: Displays all step outputs via `WORK_PRODUCT_UPDATE` WebSocket messages. These are classified as `Interim`, `Final`, or `Plan` based on step analysis and saved to the Librarian's `workProducts` collection.

2. **Files Tab (Shared Files)**: Displays files uploaded to the shared file space via the Librarian's `step-outputs` collection. These are `MissionFile` objects with user-friendly metadata and are accessible through the file management UI.

The key insight is that **not all results are files, but may be memorialized in files**. The Results tab shows all computational outputs, while the Files tab shows persistent file artifacts that users can download, share, and reference.

### 5.2. Implementation Strategy

The implementation will enhance the existing dual-channel approach by:
1. Adding deliverable metadata to the plan schema
2. Modifying step execution logic to respect deliverable flags
3. Enhancing the LLM prompts to generate appropriate deliverable declarations
4. Updating the UI to better distinguish between interim work products and final deliverables

### 5.3. Phase 1: Schema Enhancement

#### 5.3.1. Update Plan Schema (shared/python/lib/plan_validator.py)

**File**: `shared/python/lib/plan_validator.py`
**Changes**: Extend the `PLAN_STEP_SCHEMA` to include deliverable properties in the outputs section.

```python
# In the outputs section of PLAN_STEP_SCHEMA
"outputs": {
    "type": "object",
    "patternProperties": {
        "^[a-zA-Z][a-zA-Z0-9_]*$": {
            "oneOf": [
                {
                    # Simple string description (current format)
                    "type": "string",
                    "description": "Thorough description of the expected output"
                },
                {
                    # Enhanced object format with deliverable properties
                    "type": "object",
                    "properties": {
                        "description": {
                            "type": "string",
                            "description": "Thorough description of the expected output"
                        },
                        "isDeliverable": {
                            "type": "boolean",
                            "description": "Whether this output is a final deliverable for the user"
                        },
                        "filename": {
                            "type": "string",
                            "description": "User-friendly filename for the deliverable"
                        }
                    },
                    "required": ["description"],
                    "additionalProperties": False
                }
            ]
        }
    },
    "additionalProperties": False,
    "description": "Expected outputs from this step"
}
```

#### 5.3.2. Update TypeScript Types

**File**: `shared/src/types/Plan.ts` (create if doesn't exist)
**Changes**: Add TypeScript interfaces for the enhanced output schema.

```typescript
export interface PlanOutput {
    description: string;
    isDeliverable?: boolean;
    filename?: string;
}

export interface PlanStep {
    number: number;
    actionVerb: string;
    description: string;
    inputs: Record<string, any>;
    outputs: Record<string, string | PlanOutput>;
    recommendedRole?: string;
}
```

### 5.4. Phase 2: ACCOMPLISH Plugin Enhancement

#### 5.4.1. Update LLM Prompts

**File**: `services/capabilitiesmanager/src/plugins/ACCOMPLISH/main.py`
**Changes**: Enhance the `_convert_to_structured_plan` method to include deliverable guidance.

Add to the prompt in `_convert_to_structured_plan`:

```python
**5. DELIVERABLE IDENTIFICATION:**
When defining outputs, identify which ones are final deliverables that the user will want to see:
- For outputs that represent final results, reports, or completed work products, use the enhanced format:
  ```json
  "outputs": {
    "final_report": {
      "description": "A comprehensive analysis report",
      "isDeliverable": true,
      "filename": "market_analysis_2025.md"
    }
  }
  ```
- For intermediate outputs used only by subsequent steps, use the simple string format:
  ```json
  "outputs": {
    "research_data": "Raw research data for analysis"
  }
  ```
- Guidelines for deliverable filenames:
  * Use descriptive, professional names
  * Include relevant dates or versions
  * Use appropriate file extensions (.md, .txt, .json, .csv, etc.)
  * Avoid generic names like "output.txt" or "result.json"
```

#### 5.4.2. Update Validation Logic

**File**: `shared/python/lib/plan_validator.py`
**Changes**: Add validation for deliverable properties in the `PlanValidator` class.

```python
def _validate_deliverable_outputs(self, step: Dict[str, Any]) -> List[str]:
    """Validate deliverable output properties."""
    errors = []
    outputs = step.get('outputs', {})

    for output_name, output_def in outputs.items():
        if isinstance(output_def, dict):
            is_deliverable = output_def.get('isDeliverable', False)
            filename = output_def.get('filename')

            if is_deliverable and not filename:
                errors.append(f"Step {step.get('number')}: Output '{output_name}' marked as deliverable but missing filename")

            if filename and not is_deliverable:
                # Warn but don't error - filename without isDeliverable is allowed
                print(f"Warning: Step {step.get('number')}: Output '{output_name}' has filename but not marked as deliverable")

    return errors
```

### 5.5. Phase 3: Step Execution Logic Enhancement

#### 5.5.1. Update Step Class

**File**: `services/agentset/src/agents/Step.ts`
**Changes**: Add method to check if outputs are deliverables and extract deliverable metadata.

```typescript
/**
 * Check if a specific output is marked as a deliverable
 */
private isOutputDeliverable(outputName: string): boolean {
    const outputDef = this.getOriginalOutputDefinition(outputName);
    return typeof outputDef === 'object' && outputDef.isDeliverable === true;
}

/**
 * Get the filename for a deliverable output
 */
private getDeliverableFilename(outputName: string): string | undefined {
    const outputDef = this.getOriginalOutputDefinition(outputName);
    if (typeof outputDef === 'object') {
        return outputDef.filename;
    }
    return undefined;
}

/**
 * Get the original output definition from the plan
 */
private getOriginalOutputDefinition(outputName: string): string | PlanOutput {
    // This would need to access the original plan step definition
    // Implementation depends on how plan metadata is stored with the step
    return this.outputs.get(outputName) || '';
}
```

#### 5.5.2. Update Agent Class

**File**: `services/agentset/src/agents/Agent.ts`
**Changes**: Modify the `saveWorkProductWithClassification` method to respect deliverable flags.

```typescript
private async saveWorkProductWithClassification(stepId: string, data: PluginOutput[], isAgentEndpoint: boolean, allAgents: Agent[]): Promise<void> {
    // ... existing code ...

    // Check if any outputs are marked as deliverables
    const step = this.steps.find(s => s.id === stepId);
    const hasDeliverables = step && this.stepHasDeliverables(step);

    // Determine upload behavior based on deliverable flags
    let shouldUploadToSharedSpace = false;

    if (hasDeliverables) {
        // Only upload outputs marked as deliverables
        shouldUploadToSharedSpace = true;
        uploadedFiles = await this.uploadDeliverablesOnly(step, data);
    } else {
        // Fallback to existing logic for backward compatibility
        shouldUploadToSharedSpace = (
            (outputType === OutputType.FINAL && data && data.length > 0) ||
            (data && data.length > 0 && this.stepGeneratesUserReferencedData(stepId, data)) ||
            outputsHaveFiles
        );

        if (shouldUploadToSharedSpace && step && step.actionVerb !== 'FILE_OPERATION') {
            uploadedFiles = await this.uploadStepOutputsToSharedSpace(step, data);
        }
    }

    // ... rest of existing code ...
}

private stepHasDeliverables(step: Step): boolean {
    // Check if any outputs in the step are marked as deliverables
    for (const [outputName, _] of step.outputs) {
        if (step.isOutputDeliverable(outputName)) {
            return true;
        }
    }
    return false;
}

private async uploadDeliverablesOnly(step: Step, data: PluginOutput[]): Promise<MissionFile[]> {
    const uploadedFiles: MissionFile[] = [];

    for (const output of data) {
        if (step.isOutputDeliverable(output.name)) {
            const customFilename = step.getDeliverableFilename(output.name);
            const missionFile = await this.createMissionFileForOutput(output, step, customFilename);
            uploadedFiles.push(missionFile);
        }
    }

    return uploadedFiles;
}
```

### 5.6. Phase 4: UI Enhancement

#### 5.6.1. Update Work Products Display

**File**: `services/mcsreact/src/components/TabbedPanel.tsx`
**Changes**: Add visual distinction for deliverables in the Results tab.

```typescript
// In the work products table rendering
<TableCell>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {product.type}
        {product.isDeliverable && (
            <Chip
                label="Deliverable"
                size="small"
                color="primary"
                variant="outlined"
            />
        )}
    </Box>
</TableCell>
```

#### 5.6.2. Enhance File Display

**File**: `services/mcsreact/src/components/FileUpload.tsx`
**Changes**: Add metadata to show which files are deliverables vs user uploads.

```typescript
// In the file list rendering
<ListItemText
    primary={file.originalName}
    secondary={(
        <Box>
            <Typography variant="caption" display="block">
                {formatFileSize(file.size)} • {new Date(file.uploadedAt).toLocaleDateString()}
            </Typography>
            {file.isDeliverable && (
                <Chip
                    label="System Deliverable"
                    size="small"
                    color="secondary"
                    sx={{ mt: 0.5, mr: 0.5 }}
                />
            )}
            {file.description && (
                <Chip
                    label={file.description}
                    size="small"
                    sx={{ mt: 0.5 }}
                />
            )}
        </Box>
    )}
/>
```

### 5.7. Phase 5: Data Flow Updates

#### 5.7.1. Update MissionFile Interface

**File**: `services/mcsreact/src/context/WebSocketContext.tsx`
**Changes**: Add deliverable metadata to the MissionFile interface.

```typescript
export interface LocalMissionFile {
    id: string;
    originalName: string;
    size: number;
    mimeType: string;
    uploadedAt: string;
    uploadedBy: string;
    description?: string;
    preview?: string;
    isDeliverable?: boolean;  // New field
    stepId?: string;          // New field to track source step
}
```

#### 5.7.2. Update Work Product Messages

**File**: `services/agentset/src/agents/Agent.ts`
**Changes**: Include deliverable metadata in work product messages.

```typescript
const workProductPayload: any = {
    id: stepId,
    type: type,
    scope: scope,
    name: data[0] ? data[0].resultDescription : 'Step Output',
    agentId: this.id,
    stepId: stepId,
    missionId: this.missionId,
    mimeType: data[0]?.mimeType || 'text/plain',
    fileName: data[0]?.fileName,
    isDeliverable: hasDeliverables, // New field
    workproduct: (type === 'Plan' && data[0]?.result) ?
        `Plan with ${Array.isArray(data[0].result) ? data[0].result.length : Object.keys(data[0].result).length} steps` : data[0]?.result
};
```

### 5.8. Implementation Timeline

**Week 1: Schema and Core Logic**
- [ ] Update plan schema in shared library
- [ ] Enhance ACCOMPLISH plugin prompts
- [ ] Update plan validation logic

**Week 2: Step Execution**
- [ ] Modify Step class for deliverable detection
- [ ] Update Agent class upload logic
- [ ] Add deliverable-aware file creation

**Week 3: UI and Data Flow**
- [ ] Update frontend interfaces and types
- [ ] Enhance Results and Files tab displays
- [ ] Update WebSocket message handling

**Week 4: Testing and Refinement**
- [ ] Test with various plan types
- [ ] Validate backward compatibility
- [ ] Refine UI based on user feedback

### 5.9. Testing Strategy

1. **Unit Tests**: Test deliverable detection logic in Step and Agent classes
2. **Integration Tests**: Test end-to-end flow from plan generation to UI display
3. **Backward Compatibility**: Ensure existing plans without deliverable flags work correctly
4. **User Experience**: Test with real missions to validate UI improvements

### 5.10. Rollback Plan

If issues arise, the system can be rolled back by:
1. Reverting to simple string outputs in plan schema
2. Disabling deliverable-specific upload logic
3. Falling back to existing work product classification

The implementation maintains backward compatibility, so existing functionality will continue to work even if the new features are disabled.
