# ACCOMPLISH Plugin Documentation

## Overview

The ACCOMPLISH plugin is a core component of the Stage7 system that handles mission planning and novel action verb processing. It serves two primary functions:

1. **Mission Goal Planning**: Takes high-level goals and creates detailed, executable plans
2. **Novel Verb Handling**: Processes unknown action verbs by creating plans, providing direct answers, or recommending new plugins

## Key Features

### Mission Goal Planning
- Converts abstract goals into structured, executable plans
- Uses a two-phase approach: prose planning followed by schema translation
- Validates plan structure and ensures all required fields are present
- Supports complex multi-step missions with dependencies

### Novel Verb Handling
- Automatically handles unknown action verbs encountered during execution
- Can create plans using any action verbs (including novel ones)
- Supports three response types:
  - **Plan**: Step-by-step breakdown using action verbs
  - **Direct Answer**: Immediate response for simple queries
  - **Plugin Recommendation**: Suggests new plugin development

## Architecture

### Core Components

1. **AccomplishOrchestrator**: Main entry point that routes requests
2. **MissionGoalPlanner**: Handles goal-to-plan conversion
3. **NovelVerbHandler**: Processes unknown action verbs
4. **SharedValidator**: Validates inputs and responses

### Brain Integration

The plugin integrates with the Brain service for LLM processing:
- Uses `responseType: 'json'` for structured responses
- Brain automatically cleans JSON responses (removes markdown, fixes formatting)
- Supports retry logic and model selection

## Usage

### Input Format

```json
{
  "goal": "Your mission goal here",
  "available_plugins": "[JSON array of available plugins]"
}
```

### Output Format

```json
{
  "success": true,
  "name": "plan",
  "resultType": "plan",
  "resultDescription": "A plan to: [goal description]",
  "result": [
    {
      "number": 1,
      "actionVerb": "SEARCH",
      "description": "Step description",
      "inputs": {},
      "outputs": {},
      "dependencies": {},
      "recommendedRole": "researcher"
    }
  ],
  "mimeType": "application/json"
}
```

## Configuration

### Environment Variables

- `BRAIN_URL`: Brain service endpoint (default: "brain:5070")
- `SECURITYMANAGER_URL`: Security manager endpoint
- `CLIENT_SECRET`: Authentication secret

### Dependencies

- `requests>=2.28.0`: HTTP client for Brain communication
- Python 3.8+: Runtime environment

## Best Practices

1. **Action Verb Usage**: The system is designed to learn new action verbs - don't restrict plans to only basic verbs
2. **Error Handling**: The Brain service handles JSON cleaning automatically
3. **Schema Validation**: Use proper JSON schemas instead of examples in prompts
4. **Modularity**: Keep individual functions focused and under 150 lines

## Troubleshooting

### Common Issues

1. **JSON Parse Errors**: Ensure Brain service is properly cleaning responses
2. **Authentication Failures**: Check CLIENT_SECRET and SecurityManager connectivity
3. **Plan Validation Errors**: Verify all required fields are present in plan steps

### Debugging

Enable detailed logging by setting log level to INFO. The plugin logs:
- Brain request/response details
- JSON parsing attempts
- Validation results
- Error details with context

## Future Enhancements

- Support for parallel step execution
- Enhanced dependency resolution
- Plugin recommendation intelligence
- Performance metrics tracking
