# LLM Performance Tracking Implementation

## Overview

This document outlines the implementation of dynamic LLM performance tracking in the Stage7 system. The implementation enables automatic tracking of LLM performance metrics, intelligent model selection based on performance data, and a dashboard for visualizing model performance.

## Components

### Backend (Brain Service)

1. **ModelPerformanceTracker**
   - Tracks performance metrics for each model and conversation type
   - Metrics include success rate, latency, token count, and feedback scores
   - Implements blacklisting for models that fail consecutively
   - Persists performance data to disk for historical analysis

2. **ModelManager**
   - Selects models based on optimization criteria and performance data
   - Adjusts model scores based on actual performance
   - Provides fallback mechanisms when models fail
   - Exposes API endpoints for retrieving performance data

3. **ResponseEvaluator**
   - Evaluates responses from models
   - Records human feedback on model responses
   - Provides improvement suggestions
   - Generates evaluation summaries

4. **API Endpoints**
   - `/performance`: Get performance data for all models
   - `/performance/rankings`: Get model rankings for a conversation type
   - `/performance/metrics/:modelName`: Get metrics for a specific model
   - `/performance/blacklisted`: Get blacklisted models
   - `/performance/summary`: Get performance summary
   - `/evaluations`: Get all evaluations
   - `/evaluations/model/:modelName`: Get evaluations for a specific model
   - `/evaluations/summary`: Get evaluation summaries

### Frontend

1. **ModelPerformanceDashboard**
   - Displays performance metrics for all models
   - Shows model rankings based on different criteria
   - Visualizes usage statistics and feedback scores
   - Allows filtering by conversation type and metric

2. **ModelFeedbackForm**
   - Allows users to provide feedback on model responses
   - Collects ratings for relevance, accuracy, helpfulness, creativity, and overall quality
   - Submits feedback to the Brain service for processing

## Features

### Automatic Model Selection

The system automatically selects the best model for each request based on:

1. **Optimization Criteria**: Cost, accuracy, creativity, speed, or continuity
2. **Conversation Type**: Text-to-text, text-to-image, text-to-audio, or text-to-video
3. **Performance Data**: Success rate, latency, token count, and feedback scores

### Blacklisting Mechanism

Models that fail consecutively are temporarily blacklisted:

1. **Consecutive Failures**: Models are blacklisted after 3 consecutive failures
2. **Blacklist Duration**: Duration increases exponentially with more failures
   - 3 failures: 1 hour
   - 4 failures: 2 hours
   - 5 failures: 4 hours
   - etc.
3. **Automatic Recovery**: Models are automatically removed from the blacklist after the blacklist period expires

### Fallback Mechanism

When a model fails, the system automatically tries alternative models:

1. **Retry Logic**: The system tries up to 3 models before giving up
2. **Model Selection**: Each retry selects the next best model based on performance data
3. **Error Handling**: Detailed error information is logged for debugging

### Performance Metrics

The system tracks the following metrics for each model:

1. **Success Rate**: Percentage of successful requests
2. **Average Latency**: Average response time in milliseconds
3. **Average Token Count**: Average number of tokens per response
4. **Feedback Scores**: User ratings for relevance, accuracy, helpfulness, creativity, and overall quality

## Usage

### Accessing the Dashboard

The model performance dashboard is available at `/model-performance` in the web interface. It provides:

1. **Performance Metrics**: Success rate, latency, token count, and feedback scores for each model
2. **Model Rankings**: Models ranked by different metrics
3. **Usage Statistics**: Total usage, success count, and failure count for each model
4. **Feedback Scores**: User ratings for each model

### Providing Feedback

Users can provide feedback on model responses through the ModelFeedbackForm component, which collects:

1. **Relevance**: How relevant the response is to the prompt
2. **Accuracy**: How accurate the information in the response is
3. **Helpfulness**: How helpful the response is
4. **Creativity**: How creative the response is
5. **Overall**: Overall quality of the response

## Configuration

No additional configuration is required for the LLM performance tracking system. It works automatically with the existing LLM models and interfaces.

## Future Enhancements

1. **Advanced Analytics**: More sophisticated analysis of model performance
2. **Cost Tracking**: Track the cost of each model request
3. **A/B Testing**: Compare different models on the same prompts
4. **Automated Prompt Optimization**: Automatically optimize prompts based on performance data
5. **Model Rotation**: Automatically rotate models based on performance and cost
