# Model Performance Scoring & Critical Failure Blacklisting

## Overview
Models that fail to follow explicit instructions are penalized with a critical failure score and can be temporarily blacklisted to prevent cascading failures.

## Changes Implemented

### 1. ACCOMPLISH Plugin (Python)
**File**: `services/capabilitiesmanager/src/plugins/ACCOMPLISH/main.py`

#### Enhanced `report_logic_failure_to_brain()` function:
- Added `severity` parameter: `"critical"` or `"normal"`
- Critical failures indicate instruction-following violations (e.g., returning wrong data structure)
- Normal failures are standard errors (e.g., API timeout)

#### Critical Instruction-Following Failures Detected:
1. **JSON Format Violation** (line 848):
   - LLM told explicitly to return JSON
   - Returns non-JSON or unparseable content
   - Reported as: `severity="critical"`

2. **Single Step Instead of Array** (line 869):
   - LLM told explicitly to return `{"steps": [...]}`
   - Returns single step `{"id": "...", "actionVerb": "...", ...}`
   - **FIXED**: Now checks for `"steps"` key first before treating dict as error
   - Reported as: `severity="critical"`

3. **Missing Plan Array** (line 883):
   - LLM returns valid JSON but no recognizable plan array structure
   - Reported as: `severity="critical"`

### 2. Brain Service - HTTP Endpoint (TypeScript)
**File**: `services/brain/src/Brain.ts`

#### Enhanced `POST /reportLogicFailure` endpoint:
```typescript
{
  "requestId": "request-uuid",
  "reason": "Detailed description of failure",
  "severity": "critical" | "normal"  // NEW
}
```

- Extracts severity from request body
- Passes to `ModelManager.trackLogicFailure()` with severity parameter
- Logs severity level in console for visibility

### 3. Model Manager (TypeScript)
**File**: `services/brain/src/utils/modelManager.ts`

#### Enhanced `trackLogicFailure()` method:
- Now accepts `severity` parameter (default: `'normal'`)
- Passes severity to `performanceTracker.trackLogicFailure()`
- Clears model selection cache on critical failures to force re-evaluation

### 4. Performance Tracker (TypeScript)
**File**: `services/brain/src/utils/performanceTracker.ts`

#### Enhanced `ModelPerformanceMetrics` interface:
```typescript
interface ModelPerformanceMetrics {
  // ... existing fields ...
  criticalFailureCount?: number;        // NEW: tracks instruction-following failures
  isTemporarilyBlacklisted?: boolean;   // NEW: flag for temporary blacklist
  blacklistUntil?: string;              // NEW: ISO timestamp of blacklist expiry
}
```

#### Enhanced `trackLogicFailure()` method:
- **Severity Weighting**:
  - `critical`: Counts as 5x failure weight
  - `normal`: Counts as 1x failure weight
  
- **Critical Failure Accumulation**:
  ```
  3+ critical failures → Automatic temporary blacklist (30 minutes)
  ```

- **Blacklist Trigger**:
  - Sets `metrics.isTemporarilyBlacklisted = true`
  - Sets `metrics.blacklistUntil` to 30 minutes from now
  - Logs warning: `⚠️  MODEL BLACKLISTED: {modelName} due to {count} critical failures`

#### Existing Model Selection Logic (Already Working):
- Model selection at lines 218-223 already checks `isModelBlacklisted()`
- Blacklisted models are skipped during selection
- Special handling for TextToJSON: if all models are blacklisted, reset blacklists

## Behavior Flow

### When a Critical Failure Occurs:

1. **ACCOMPLISH detects schema violation**
   ```
   LLM returns: {"id": "...", "actionVerb": "..."}
   Expected:    {"steps": [{...}, {...}]}
   ```

2. **Reports to Brain with `severity="critical"`**
   ```python
   report_logic_failure_to_brain(
     request_id,
     inputs,
     "LLM returned single step instead of plan array",
     severity="critical"
   )
   ```

3. **Brain tracks critical failure in performance data**
   - `model_data.metrics[conversationType].criticalFailureCount += 1`
   - `model_data.metrics[conversationType].logicFailureCount += 5`

4. **After 3rd critical failure**
   - Model is blacklisted for 30 minutes
   - Future model selection will skip this model
   - Prevents repeated failures from same model

5. **Model recovers after blacklist period**
   - Blacklist expires after 30 minutes
   - Model eligible for selection again
   - Critical failure count preserved (historical tracking)

## Example Scenario

```
Time 1: Model A returns wrong structure → Critical failure #1
Time 2: Model A returns wrong structure → Critical failure #2
Time 3: Model A returns wrong structure → Critical failure #3
   ↓
   [MODEL A BLACKLISTED FOR 30 MINUTES]
   Future requests will use other available models
   ↓
Time 35 min: Blacklist expires, Model A can be used again
   But has 3+ critical failures in history
```

## Monitoring & Visibility

### Console Logs:
```
[Brain] Received critical logic failure report for request {id}: {reason}
[Brain] Tracking critical logic failure for model {name}, conversation type {type}
[PerformanceTracker] CRITICAL FAILURE for {name} ({type}): count now 3
[PerformanceTracker] ⚠️  MODEL BLACKLISTED: {name} due to 3 critical failures
```

### Model Performance Dashboard:
- Shows critical failure count per model
- Shows blacklist status and expiry time
- Displays failure reasons for debugging

## Recovery & Manual Override

The system includes safety mechanisms:

1. **Automatic timeout**: 
   - Max 7-day blacklist enforced by `resetExcessiveBlacklists()`
   - Prevents permanent model lockout

2. **Manual reset** (admin endpoint):
   - `/admin/resetBlacklists` can clear blacklists
   - Useful if model is fixed and needs immediate re-evaluation

3. **Progressive backoff**:
   - TextToJSON special handling: if ALL models are blacklisted, automatically reset

## Design Rationale

### Why Critical Failures Matter:
- **Instruction-following is fundamental** to LLM reliability
- A model that can't follow explicit schema instructions will fail across all uses
- **5x penalty weight** escalates reputation damage quickly
- **3-strike automatic blacklist** prevents cascading failures while giving grace period

### Why Not Permanent Blacklist:
- Model behavior can improve with prompt engineering changes
- LLM services may update/fix underlying models
- Temporary blacklist (30 min) allows for recovery testing
- 3-strike rule prevents hair-trigger blacklisting

### Why Performance Tracking:
- Models should be held accountable for instruction-following
- Visibility into model quality enables better decision-making
- Historical data shows which models have reliability issues
- Allows deprecation of consistently poor models

