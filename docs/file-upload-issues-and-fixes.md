# File Upload Issues and Fixes

## Issues Identified

### 1. Authentication Error (401) on submitUserInput

**Problem**: The frontend was not sending authentication tokens when uploading files through the `submitUserInput` endpoint.

**Root Cause**: The UserInputModal component was using `fetch` directly without including the authentication header.

**Fix Applied**: Updated UserInputModal.tsx to include the authentication token from localStorage in the request headers.

```typescript
// Get authentication token from localStorage
const token = localStorage.getItem('authToken');
const headers: HeadersInit = {};
if (token) {
    headers['Authorization'] = `Bearer ${token}`;
}

// Submit file upload with authentication
const response = await fetch('http://localhost:5020/submitUserInput', {
    method: 'POST',
    headers,
    body: formData
});
```

### 2. Excessive LLM Calls (15 calls before success)

**Problem**: The ACCOMPLISH plugin required 15 LLM calls before generating a valid plan.

**Root Causes**:
1. **Model Selection Issues**: The system selected `mistral/pixtral-12B-2409` (a vision model) which is not optimized for JSON generation
2. **JSON Format Issues**: Models were returning markdown-formatted analysis instead of pure JSON
3. **Inadequate JSON Recovery**: The JSON recovery system couldn't handle the specific markdown patterns being returned
4. **Model Blacklisting Cascade**: Failed models got blacklisted, causing fallbacks to other unsuitable models

**Fixes Applied**:

#### A. Improved ACCOMPLISH Plugin Prompt
- Made JSON requirements more explicit and strict
- Added multiple warnings about avoiding markdown formatting
- Emphasized that responses must start with `{` and end with `}`

```python
CRITICAL JSON REQUIREMENTS:
- Return ONLY valid JSON - no explanations, markdown, code blocks, or additional text
- Do NOT wrap your response in ```json``` blocks or any markdown formatting
- Do NOT include "### ANALYSIS:" or "### RECOMMENDATIONS:" or any other text
- Start your response immediately with { and end with }
- Your entire response must be parseable as JSON
```

#### B. Enhanced JSON Recovery in Brain Service
- Added specific patterns to remove markdown headers (`### ANALYSIS:`, `### RECOMMENDATIONS:`)
- Added removal of markdown formatting (`**bold**`, numbered lists, etc.)
- Added removal of "end of response" markers
- Improved markdown code block removal

#### C. Changed Conversation Type
- Changed from `TextToCode` to `TextToText` for better model selection
- `TextToText` is more appropriate for JSON generation tasks

## Technical Details

### Authentication Flow
1. User uploads file in response to ASK_USER_QUESTION with answerType: 'file'
2. Frontend includes Bearer token in Authorization header
3. PostOffice verifies token and processes file upload
4. File is stored via FileUploadService and metadata saved to Librarian
5. File ID is returned to the agent

### JSON Recovery Process
1. Model returns response (potentially with markdown)
2. BaseInterface attempts direct JSON parsing
3. If failed, applies markdown removal and common JSON fixes
4. If still failed, attempts to extract JSON blocks from text
5. If all fails, model gets blacklisted and system tries fallback

### Model Selection Impact
- Vision models like `pixtral-12B-2409` are not optimized for structured text generation
- Using `TextToText` conversation type helps select more appropriate models
- Models that consistently fail JSON generation get blacklisted to prevent repeated failures

## Expected Improvements

### Reduced LLM Calls
- Better model selection should reduce initial failures
- Improved JSON recovery should handle edge cases better
- Clearer prompts should reduce formatting issues

### Successful File Upload
- Authentication fix enables proper file upload workflow
- Users can now upload files when requested by agents
- File IDs are properly returned for use in subsequent steps

## Testing Recommendations

1. **Test File Upload Authentication**: Verify that file uploads work with proper authentication
2. **Test ACCOMPLISH Plugin**: Create missions that request file uploads and verify fewer LLM calls are needed
3. **Monitor Brain Logs**: Check that JSON parsing failures are reduced
4. **Test Complete Workflow**: Verify end-to-end file upload → file ID → FILE_OPERATION workflow

## Future Improvements

1. **Model Preferences**: Consider adding model preferences for JSON generation tasks
2. **Prompt Templates**: Create specialized prompt templates for different response types
3. **JSON Schema Validation**: Add schema validation at the plugin level for better error messages
4. **Retry Logic**: Implement smarter retry logic that tries different models for different task types
