# Test File Upload Workflow

This document describes how to test the new MissionFile strategy for handling file uploads through the ASK_USER_QUESTION plugin.

## Test Scenario

1. **Create a mission** that asks the user to upload a file
2. **User uploads a file** in response to the question
3. **System returns a file ID** to the agent
4. **Agent uses the file ID** with FILE_OPERATION plugin to read the file content

## Example Plan

Here's an example plan that the ACCOMPLISH plugin should generate:

```json
{
  "type": "PLAN",
  "plan": [
    {
      "number": 1,
      "actionVerb": "ASK_USER_QUESTION",
      "inputs": {
        "question": {
          "value": "Please upload the document you want me to analyze.",
          "valueType": "string"
        },
        "answerType": {
          "value": "file",
          "valueType": "string"
        }
      },
      "description": "Ask the user to upload a file for analysis",
      "outputs": {
        "file_id": "The ID of the uploaded file"
      },
      "dependencies": {},
      "recommendedRole": "coordinator"
    },
    {
      "number": 2,
      "actionVerb": "FILE_OPERATION",
      "inputs": {
        "fileId": {
          "outputName": "file_id",
          "valueType": "string"
        },
        "operation": {
          "value": "read",
          "valueType": "string"
        }
      },
      "description": "Read the content of the uploaded file using its file ID",
      "outputs": {
        "file_content": "The content of the uploaded file"
      },
      "dependencies": {
        "file_id": 1
      },
      "recommendedRole": "executor"
    }
  ]
}
```

## Testing Steps

1. **Start the system** with all services running
2. **Create a mission** with the goal: "Analyze the uploaded document"
3. **Wait for the ASK_USER_QUESTION** step to execute
4. **Upload a text file** when prompted
5. **Verify the file ID** is returned
6. **Verify the FILE_OPERATION** step reads the file content using the file ID

## Expected Behavior

- The frontend should show a file upload dialog when answerType is 'file'
- The uploaded file should be stored in the mission-files directory
- The file metadata should be stored in the Librarian service
- The FILE_OPERATION plugin should successfully read the file content using the file ID
- The agent should receive the file content and continue with the mission

## Key Components Modified

1. **UserInputRequest.ts** - Added 'file' to answerType enum
2. **BaseEntity.ts** - Added answerType parameter to ask method
3. **Agent.ts** - Updated handleAskStep to support answerType
4. **PostOffice.ts** - Enhanced submitUserInput to handle file uploads
5. **UserInputModal.tsx** - Added file upload support
6. **FILE_OPS_PYTHON** - Added fileId input support
7. **ACCOMPLISH plugin** - Updated prompt to include file upload instructions

## Troubleshooting

If the workflow doesn't work:

1. Check that all services are running and can communicate
2. Verify the file upload middleware is properly configured
3. Check that the Librarian service is storing file metadata correctly
4. Ensure the FILE_OPERATION plugin can access the file storage path
5. Verify the frontend is sending files with the correct form data format
