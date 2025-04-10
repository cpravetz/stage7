# LLM Enhancements

This document describes the implementation of LLM enhancements in the Stage7 system, including model performance tracking, prompt management, and response evaluation.

## 1. Model Performance Tracking

### Overview

Model performance tracking allows the system to monitor and analyze the performance of different LLM models over time. This information is used to improve model selection and optimize the system's overall performance.

### Implementation

The model performance tracking system consists of the following components:

1. **ModelPerformanceTracker**: A class that tracks model performance metrics
2. **ModelManager Integration**: Updates to the ModelManager to use performance data for model selection
3. **Performance Metrics**: Collection of metrics such as success rate, latency, and token count
4. **Feedback Loop**: Mechanism for incorporating user feedback into model selection

### Key Features

- **Automatic Metric Collection**: Tracks success rate, latency, token count, and other metrics
- **Performance-Based Model Selection**: Adjusts model scores based on actual performance
- **Historical Performance Data**: Maintains a history of model performance for analysis
- **API Endpoints**: Provides access to performance data and rankings

### Usage

```typescript
// Track a model request
const requestId = modelManager.trackModelRequest(
  modelName,
  conversationType,
  prompt
);

// Track a model response
modelManager.trackModelResponse(
  requestId,
  response,
  tokenCount,
  success,
  error
);

// Get performance metrics for a model
const metrics = modelManager.getModelPerformanceMetrics(
  modelName,
  conversationType
);

// Get model rankings for a conversation type
const rankings = modelManager.getModelRankings(
  conversationType,
  'overall'
);
```

## 2. Prompt Management

### Overview

Prompt management provides a system for creating, storing, versioning, and optimizing prompts. This helps ensure consistency, reusability, and continuous improvement of prompts across the system.

### Implementation

The prompt management system consists of the following components:

1. **PromptManager**: A class for managing prompt templates
2. **Prompt Templates**: Structured templates with variables for dynamic content
3. **Template Versioning**: Support for tracking template versions
4. **Template Testing**: Functionality for testing templates with different variables
5. **Template Metrics**: Collection of metrics for template performance

### Key Features

- **Template-Based Prompts**: Create reusable prompt templates with variables
- **Version Control**: Track changes to templates over time
- **Performance Metrics**: Monitor template effectiveness
- **Template Testing**: Test templates with different variables
- **API Endpoints**: Manage templates through a REST API

### Usage

```typescript
// Create a new template
const template = promptManager.createTemplate({
  name: 'Code Generation',
  description: 'A template for generating code',
  template: 'Write {{language}} code to {{task}}. Include comments to explain your code.',
  variables: ['language', 'task'],
  tags: ['code', 'programming'],
  category: 'development',
  version: '1.0.0',
  author: 'system',
  examples: []
});

// Render a template with variables
const renderedPrompt = promptManager.renderTemplate(
  templateId,
  { language: 'JavaScript', task: 'calculate factorial' }
);

// Use a template in a chat request
const result = await brain.chat({
  promptTemplateId: templateId,
  variables: { language: 'JavaScript', task: 'calculate factorial' },
  optimization: 'accuracy'
});
```

## 3. Response Evaluation

### Overview

Response evaluation provides a system for assessing the quality of LLM responses. This helps identify areas for improvement, track response quality over time, and provide feedback to users.

### Implementation

The response evaluation system consists of the following components:

1. **ResponseEvaluator**: A class for evaluating LLM responses
2. **Evaluation Criteria**: A set of criteria for assessing response quality
3. **Automated Evaluation**: Automatic evaluation of responses based on heuristics
4. **Human Feedback**: Support for human evaluation and feedback
5. **Improvement Suggestions**: Generation of suggestions for improving responses

### Key Features

- **Automatic Evaluation**: Evaluate responses based on relevance, coherence, and other criteria
- **Human Feedback Collection**: Collect and incorporate human feedback
- **Quality Metrics**: Track response quality over time
- **Improvement Suggestions**: Generate suggestions for improving responses
- **API Endpoints**: Access evaluation data through a REST API

### Usage

```typescript
// Evaluate a response automatically
const evaluation = await responseEvaluator.evaluateResponseAuto(
  requestId,
  modelName,
  conversationType,
  prompt,
  response
);

// Record human evaluation
const humanEvaluation = responseEvaluator.recordHumanEvaluation(
  requestId,
  modelName,
  conversationType,
  prompt,
  response,
  {
    relevance: 8,
    accuracy: 9,
    completeness: 7,
    coherence: 8,
    helpfulness: 9,
    creativity: 6,
    safety: 10,
    overall: 8
  },
  'This response was very helpful and accurate.'
);

// Get evaluations for a model
const evaluations = responseEvaluator.getEvaluationsForModel(modelName);

// Get average scores for a model
const scores = responseEvaluator.getAverageScoresForModel(modelName);
```

## Integration

The three systems are integrated with each other and with the existing Stage7 architecture:

1. **Brain Service**: Updated to use all three systems
2. **Chat Endpoint**: Enhanced to use prompt templates and track performance
3. **Model Selection**: Now considers actual performance data
4. **API Endpoints**: New endpoints for managing prompts, viewing performance, and accessing evaluations

## API Endpoints

### Model Performance Endpoints

- `GET /performance`: Get performance data for all models
- `GET /performance/rankings`: Get model rankings for a conversation type

### Prompt Management Endpoints

- `GET /prompts`: Get all prompt templates
- `GET /prompts/:id`: Get a specific prompt template
- `POST /prompts`: Create a new prompt template
- `PUT /prompts/:id`: Update a prompt template
- `DELETE /prompts/:id`: Delete a prompt template
- `POST /prompts/:id/render`: Render a prompt template with variables

### Response Evaluation Endpoints

- `GET /evaluations`: Get all response evaluations
- `GET /evaluations/model/:modelName`: Get evaluations for a specific model
- `POST /evaluations`: Record a human evaluation

## Future Enhancements

1. **Advanced Metrics**: Implement more sophisticated metrics for model performance
2. **A/B Testing**: Support for A/B testing of different prompts
3. **Automated Optimization**: Automatically optimize prompts based on performance
4. **Collaborative Editing**: Support for collaborative editing of prompt templates
5. **Integration with External Tools**: Connect with external evaluation and optimization tools
