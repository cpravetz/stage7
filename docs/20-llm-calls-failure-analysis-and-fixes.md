# 20 LLM Calls and Plan Creation Failure Analysis

## Problem Summary

The system experienced 20 LLM calls followed by a failure to create a plan, with multiple timeout errors and JSON recovery failures. Despite implementing retry loops in the Brain service, the system still crashed due to HTTP timeouts and malformed responses.

## Root Cause Analysis

### 1. **Brain Service JSON Recovery Failures**

**Issue**: LLMs returning plain text analysis instead of JSON
- **Lines 254-357**: Mistral model returns valid analysis text but fails JSON parsing
- **Lines 400-500**: Multiple models failing with `JSON_RECOVERY_FAILED` errors
- **Root Cause**: `TextToCode` conversation type not properly configured for JSON responses

### 2. **HTTP Timeout Before Retry Logic**

**Issue**: 30-second HTTP timeout occurring before Brain retry logic engages
- **Line 97-105**: Agent timeout after 33 seconds calling CapabilitiesManager  
- **Line 105**: `timeout of 30000ms exceeded`
- **Root Cause**: ACCOMPLISH plugin timeout (30s) < Brain processing time

### 3. **ACCOMPLISH Plugin answerType Malformation**

**Issue**: Inconsistent answerType formatting in generated plans
- **Capabilities log line 329**: `Auto-fixing missing valueType for 'question'`
- **Root Cause**: Plugin prompt examples showing inconsistent answerType format

### 4. **Rapid Model Blacklisting**

**Issue**: 9+ concurrent Brain requests causing model blacklisting
- **Lines 90-600**: Multiple concurrent chat requests
- **Lines 357, 500**: Models getting blacklisted due to JSON failures
- **Root Cause**: JSON failures + concurrent requests = rapid blacklisting

### 5. **Invalid IF_THEN Structure**

**Issue**: Generated plan contains malformed conditional logic
- **Capabilities log**: `trueSteps` and `falseSteps` as strings instead of arrays
- **Root Cause**: ACCOMPLISH plugin generating invalid conditional structure

## Implemented Fixes

### 1. **Enhanced Brain TextToCode Interface for JSON**

**Files**: 
- `services/brain/src/interfaces/AnthropicInterface.ts`
- `services/brain/src/interfaces/OpenRouterInterface.ts`

**Changes**:
```typescript
// Check if this is a JSON request based on prompt content
const isJsonRequest = prompt && (
    prompt.includes('JSON') || 
    prompt.includes('json') ||
    prompt.includes('{"type":') ||
    prompt.includes('must start with {') ||
    prompt.includes('return a JSON object')
);

const systemMessage = isJsonRequest 
    ? 'You are a JSON generation assistant. You must respond with valid JSON only. No explanations, no markdown, no code blocks - just pure JSON starting with { and ending with }.'
    : 'You are a code generation assistant. Provide only code without explanations.';
```

**Impact**: Forces LLMs to return pure JSON when ACCOMPLISH plugin requests it

### 2. **Increased ACCOMPLISH Plugin Timeout**

**File**: `services/capabilitiesmanager/src/plugins/ACCOMPLISH/main.py`

**Change**:
```python
self.timeout = 60  # Increased from 30 to 60 seconds for Brain calls
```

**Impact**: Prevents HTTP timeout before Brain retry logic can engage

### 3. **Fixed answerType Format Examples**

**File**: `services/capabilitiesmanager/src/plugins/ACCOMPLISH/main.py`

**Addition**:
```python
For ASK_USER_QUESTION with file upload:
CORRECT: "answerType": {"value": "file", "valueType": "string"}
CORRECT: "question": {"value": "Please upload your resume", "valueType": "string"}
```

**Impact**: Provides clear examples for proper answerType formatting

### 4. **Enhanced Plan Validation** (Previously Implemented)

**File**: `services/capabilitiesmanager/src/utils/validator.ts`

**Features**:
- IF_THEN structure validation
- FILE_OPERATION input validation  
- Plugin-specific requirement checks

**Impact**: Catches malformed plans before execution

## Expected Outcomes

### 1. **Immediate Improvements**

- **No More JSON Failures**: Brain will return proper JSON for ACCOMPLISH requests
- **No More HTTP Timeouts**: 60-second timeout allows Brain retry logic to work
- **Proper answerType Format**: Clear examples prevent malformed file upload requests
- **Better Error Messages**: Enhanced validation provides clearer debugging info

### 2. **Reduced LLM Call Volume**

- **Fewer Retries**: Proper JSON responses reduce need for repair attempts
- **Less Blacklisting**: Successful responses prevent rapid model blacklisting
- **Efficient Fallback**: Brain retry logic works as designed

### 3. **Improved Reliability**

- **Successful Plan Generation**: ACCOMPLISH plugin will generate valid plans
- **Proper File Uploads**: answerType formatting will work correctly
- **Better Error Handling**: Clear validation messages for debugging

## Testing Scenarios

### 1. **ACCOMPLISH Plugin JSON Response**
```
Input: Job search mission with file upload requirements
Expected: Brain returns valid JSON plan with proper answerType formatting
Result: Plan executes successfully without JSON errors
```

### 2. **Brain Service Retry Logic**
```
Input: Request that causes model timeout
Expected: Brain automatically tries next available model
Result: Request succeeds with fallback model
```

### 3. **File Upload answerType**
```
Input: Plan step requiring file upload
Expected: Proper answerType: {"value": "file", "valueType": "string"}
Result: File upload dialog works correctly
```

### 4. **Timeout Handling**
```
Input: Complex ACCOMPLISH request taking 45 seconds
Expected: Request completes within 60-second timeout
Result: No HTTP timeout, plan generated successfully
```

## Monitoring Points

### 1. **Brain Service Metrics**
- JSON parsing success rate
- Model retry frequency
- Blacklisting events
- Response times by conversation type

### 2. **ACCOMPLISH Plugin Metrics**
- Plan generation success rate
- Timeout frequency
- answerType validation errors
- Brain call duration

### 3. **System Health Indicators**
- Concurrent request handling
- Model availability
- Error recovery success rate
- Overall mission completion rate

## Prevention Strategies

### 1. **Proactive Monitoring**
- Alert on JSON parsing failure spikes
- Monitor Brain service response times
- Track model blacklisting patterns
- Watch for timeout increases

### 2. **Improved Testing**
- Automated tests for JSON response formats
- Load testing for concurrent requests
- Validation testing for plan structures
- End-to-end mission testing

### 3. **Better Documentation**
- Clear examples for all plugin input formats
- Conversation type usage guidelines
- Timeout configuration recommendations
- Error handling best practices

## Conclusion

The 20 LLM calls and plan creation failure was caused by a cascade of issues:

1. **Brain TextToCode interface** not properly configured for JSON responses
2. **HTTP timeout** occurring before Brain retry logic could engage  
3. **answerType formatting** inconsistencies in ACCOMPLISH plugin
4. **Rapid model blacklisting** due to JSON parsing failures

The implemented fixes address each root cause:

- **Enhanced JSON handling** in Brain interfaces
- **Increased timeout** for ACCOMPLISH plugin
- **Clear answerType examples** and validation
- **Better error handling** throughout the system

These changes should eliminate the JSON recovery failures, prevent HTTP timeouts, and ensure successful plan generation for complex missions like job searches with file uploads.
