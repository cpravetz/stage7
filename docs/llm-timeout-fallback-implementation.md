# LLM Timeout Fallback Implementation

## Overview

Implemented comprehensive timeout error handling in the Brain service to automatically select different models and retry when LLM timeouts occur. This prevents timeout errors from being fatal to agents and ensures system resilience.

## Key Changes

### 1. Enhanced Brain Service Error Detection

**File**: `services/brain/src/Brain.ts`

Added comprehensive timeout error detection that recognizes various timeout patterns:
- `timeout` / `TIMEOUT` / `timed out`
- `ECONNRESET` / `ECONNREFUSED` / `ENOTFOUND`
- `network` / `aborted` / `AbortError`
- `Request timeout`

### 2. Immediate Fallback for Timeout Errors

**Chat Endpoint (`/chat`)**:
- When a timeout error is detected, immediately attempts fallback to next available model
- Skips JSON retry logic for timeout errors (since timeout indicates model unavailability)
- Tracks failed response to enable blacklisting
- Returns appropriate error if no fallback model is available

**Generate Endpoint (`/generate`)**:
- Same timeout detection and fallback logic
- Preserves original request parameters for fallback model
- Handles both successful fallback and fallback failure scenarios

### 3. Aggressive Timeout-Based Blacklisting

**File**: `services/brain/src/utils/modelManager.ts`

Enhanced `trackModelResponse` method to:
- Detect timeout errors specifically
- Apply more aggressive blacklisting for timeout-prone models
- Blacklist models for 30-180 minutes based on consecutive timeout failures
- Clear model selection cache to force immediate re-evaluation

### 4. Timeout Error Flow

```
1. LLM Request → Timeout Error
2. Brain detects timeout pattern
3. Tracks failure (enables blacklisting)
4. Selects next available model
5. Retries with fallback model
6. If fallback succeeds → Return result
7. If fallback fails → Return error
8. If no fallback available → Return error
```

## Benefits

### 1. **Non-Fatal Timeouts**
- Timeout errors no longer kill agent execution
- System automatically recovers using alternative models
- Maintains service availability during model outages

### 2. **Intelligent Model Selection**
- Models with timeout issues get blacklisted automatically
- System learns which models are reliable vs unreliable
- Prevents repeated attempts with problematic models

### 3. **Improved Resilience**
- Multiple fallback layers ensure high availability
- Graceful degradation when models are unavailable
- Better error messages for debugging

### 4. **Performance Optimization**
- Timeout-prone models get blacklisted for appropriate durations
- Reduces wasted time on unreliable models
- Improves overall system response times

## Error Handling Hierarchy

1. **Timeout Errors**: Immediate fallback (highest priority)
2. **JSON Errors**: Retry with same model + corrective prompt
3. **Other Errors**: Standard fallback logic
4. **No Fallback Available**: Return appropriate error response

## Configuration

### Timeout Detection Patterns
The system recognizes these error patterns as timeouts:
- Network connectivity issues (`ECONNRESET`, `ECONNREFUSED`, `ENOTFOUND`)
- Explicit timeout messages (`timeout`, `timed out`)
- Request abortion (`aborted`, `AbortError`)
- Generic network errors (`network`, `Request timeout`)

### Blacklisting Duration
- **First timeout**: No immediate blacklisting
- **2+ consecutive timeouts**: 30-180 minutes blacklisting
- **Duration formula**: `min(consecutiveFailures * 30, 180)` minutes

## Testing Scenarios

### 1. **Single Model Timeout**
- Model A times out → System tries Model B
- Model B succeeds → Request completes successfully
- Model A gets tracked for potential blacklisting

### 2. **Multiple Model Timeouts**
- Model A times out → Try Model B
- Model B times out → Try Model C
- Continue until success or no models available

### 3. **Timeout-Prone Model**
- Model consistently times out
- Gets blacklisted for increasing durations
- System stops selecting it until blacklist expires

### 4. **No Fallback Available**
- All suitable models are blacklisted or unavailable
- System returns clear error message
- Agents can handle gracefully or retry later

## Monitoring and Debugging

### Log Messages
- `[Brain] Timeout error detected for model X, attempting immediate fallback`
- `[Brain] Attempting timeout fallback to model: Y`
- `[ModelManager] Timeout error detected for model X, applying aggressive blacklisting`
- `[ModelManager] Blacklisting timeout-prone model X for Y minutes`

### Performance Tracking
- Timeout errors are tracked separately from other failures
- Models with timeout issues get lower reliability scores
- Blacklisting data is persisted and synced to database

## Future Enhancements

1. **Adaptive Timeouts**: Adjust timeout values based on model performance
2. **Regional Fallbacks**: Try different service regions for the same model
3. **Load Balancing**: Distribute requests across multiple instances
4. **Predictive Blacklisting**: Preemptively avoid models showing degraded performance
