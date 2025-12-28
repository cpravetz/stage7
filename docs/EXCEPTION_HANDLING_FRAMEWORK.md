# Centralized Exception Handling Framework

## Overview

This document describes the centralized exception handling framework implemented for the CKTMCS platform. The framework provides a comprehensive, consistent approach to handling exceptions across all components of the system.

## Architecture

The framework consists of three main components:

1. **CentralizedExceptionHandler** - Core exception handling engine
2. **ExceptionHandlerWrapper** - Convenient wrapper for common use cases  
3. **Types and Utilities** - Shared types and helper functions

### Component Diagram

```
┌───────────────────────────────────────────────────────────────┐
│                    CentralizedExceptionHandler                 │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                 Exception Classification                 │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │              Strategy Determination                      │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                 Strategy Execution                       │  │
│  │  ┌─────────────┐  ┌─────────────────┐  ┌─────────────┐  │  │
│  │  │ Local Recovery │  │ Retry Backoff   │  │ Fallback     │  │  │
│  │  └─────────────┘  └─────────────────┘  └─────────────┘  │  │
│  │  ┌─────────────┐  ┌─────────────────┐  ┌─────────────┐  │  │
│  │  │ User Notif.  │  │ System Alert    │  │ Circuit Brkr │  │  │
│  │  └─────────────┘  └─────────────────┘  └─────────────┘  │  │
│  └─────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
                                    ▲
                                    │
┌───────────────────────────────────────────────────────────────┐
│                    ExceptionHandlerWrapper                     │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │               Async Operation Wrapper                    │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │               Sync Operation Wrapper                     │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │               Direct Exception Handling                 │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │               Configuration Management                  │  │
│  └─────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
                                    ▲
                                    │
┌───────────────────────────────────────────────────────────────┐
│                        Application Code                        │
└───────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. CentralizedExceptionHandler

The core exception handling engine that implements various strategies for handling different types of exceptions.

#### Key Features:

- **Error Classification**: Automatically classifies errors into types (TRANSIENT, RECOVERABLE, PERMANENT, VALIDATION)
- **Strategy Selection**: Intelligently selects the appropriate handling strategy based on error type and context
- **Multiple Strategies**: Implements 6 different handling strategies
- **Circuit Breaker Pattern**: Prevents repeated failures from overwhelming the system
- **Retry with Backoff**: Implements exponential backoff for transient errors
- **Error Analysis**: Integrates with existing error analysis capabilities

#### Supported Strategies:

1. **LOCAL_RECOVERY**: Attempt to recover from the error within the same component
2. **RETRY_WITH_BACKOFF**: Retry the operation with exponential backoff delays
3. **CIRCUIT_BREAKER**: Temporarily disable operations that are repeatedly failing
4. **FALLBACK_MECHANISM**: Use alternative approaches when primary operations fail
5. **USER_NOTIFICATION**: Provide meaningful feedback to users about validation errors
6. **SYSTEM_ALERT**: Trigger system-wide alerts for critical errors

### 2. ExceptionHandlerWrapper

A convenient wrapper that provides simplified interfaces for common exception handling patterns.

#### Key Features:

- **Async Operation Wrapping**: Simple wrapper for async operations with automatic exception handling
- **Sync Operation Wrapping**: Wrapper for synchronous operations
- **Direct Exception Handling**: Lower-level access to the exception handler
- **Configuration Management**: Easy configuration of retry settings and circuit breakers
- **Error Classification**: Access to error classification functionality

### 3. Types and Utilities

Shared types and utility functions that support the framework.

#### Key Types:

- **StepErrorType**: Enum for error classification
- **ErrorSeverity**: Enum for error severity levels
- **GlobalErrorCodes**: Standardized error codes
- **StructuredError**: Standard format for structured error information
- **ExceptionContext**: Context information for exception handling
- **ExceptionHandlingResult**: Result of exception handling operations

## Usage Patterns

### 1. Wrapping Async Operations

```typescript
import { ExceptionHandlerWrapper, ErrorSeverity } from '@cktmcs/errorhandler';

async function fetchData() {
    return ExceptionHandlerWrapper.wrapAsyncOperation(
        'fetchData',
        'DataService',
        async () => {
            // Your async operation here
            const response = await axios.get('https://api.example.com/data');
            return response.data;
        },
        ErrorSeverity.ERROR,
        'DATA_FETCH_FAILED',
        { endpoint: 'https://api.example.com/data' }
    );
}
```

### 2. Wrapping Sync Operations

```typescript
import { ExceptionHandlerWrapper, ErrorSeverity } from '@cktmcs/errorhandler';

function parseConfig(configString: string) {
    return ExceptionHandlerWrapper.wrapSyncOperation(
        'parseConfig',
        'ConfigService',
        () => {
            // Your sync operation here
            return JSON.parse(configString);
        },
        ErrorSeverity.VALIDATION,
        'CONFIG_PARSE_FAILED'
    );
}
```

### 3. Direct Exception Handling

```typescript
import { ExceptionHandlerWrapper, ErrorSeverity } from '@cktmcs/errorhandler';

async function processFile(filePath: string) {
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(content);
    } catch (error) {
        const result = await ExceptionHandlerWrapper.handleException({
            error,
            component: 'FileService',
            operation: 'readAndParseFile',
            severity: ErrorSeverity.ERROR,
            errorCode: 'FILE_READ_PARSE_FAILED',
            contextualData: { filePath }
        });
        
        if (!result.handled) {
            throw new Error(`File processing failed: ${result.errorDetails?.message_human_readable}`);
        }
        
        return null; // Fallback value
    }
}
```

### 4. Configuration

```typescript
// Configure retry settings for specific operations
ExceptionHandlerWrapper.configureRetrySettings('databaseOperations', 5, 2000);
ExceptionHandlerWrapper.configureRetrySettings('apiCalls', 3, 1000);

// Reset circuit breakers
ExceptionHandlerWrapper.resetCircuitBreaker('DatabaseService:connect:transient');
```

## Error Classification

The framework automatically classifies errors into four main types:

### 1. TRANSIENT Errors

Errors that might resolve on retry:
- Network timeouts
- Service unavailable (503)
- Rate limit exceeded
- Temporary resource constraints

**Handling Strategy**: RETRY_WITH_BACKOFF or CIRCUIT_BREAKER

### 2. RECOVERABLE Errors

Errors related to data or state that might be fixed:
- Missing required fields
- Data format issues
- State inconsistencies

**Handling Strategy**: LOCAL_RECOVERY or FALLBACK_MECHANISM

### 3. PERMANENT Errors

Errors that will not resolve on retry:
- Invalid input
- Authentication errors
- Resource not found (404)
- Permission denied

**Handling Strategy**: FALLBACK_MECHANISM or SYSTEM_ALERT

### 4. VALIDATION Errors

Input validation errors:
- Invalid input format
- Missing required inputs
- Type mismatches

**Handling Strategy**: USER_NOTIFICATION

## Integration with Existing Components

### Artifact Storage Service Integration

The framework has been integrated with the ArtifactStorageService to demonstrate practical usage:

```typescript
// Before: Manual error handling
try {
    await fsPromises.mkdir(nestedPath, { recursive: true });
} catch (error: any) {
    throw generateStructuredError({
        error_code: GlobalErrorCodes.ARTIFACT_STORAGE_MKDIR_FAILED,
        severity: ErrorSeverity.ERROR,
        message: `Failed to create directory for artifact ${artifact_id} at ${nestedPath}.`,
        // ... more error details
    });
}

// After: Using exception handler wrapper
await ExceptionHandlerWrapper.wrapAsyncOperation(
    'createDirectory',
    'ArtifactStorageService',
    async () => {
        await fsPromises.mkdir(nestedPath, { recursive: true });
    },
    ErrorSeverity.ERROR,
    'ARTIFACT_STORAGE_MKDIR_FAILED',
    { artifact_id, nestedPath }
);
```

### Benefits of Integration

1. **Consistent Error Handling**: All errors are handled using the same patterns
2. **Reduced Boilerplate**: Less repetitive error handling code
3. **Better Error Classification**: Automatic classification of error types
4. **Strategy Selection**: Intelligent selection of handling strategies
5. **Centralized Monitoring**: All errors flow through the same monitoring system
6. **Improved Recovery**: Better recovery mechanisms for different error types

## Configuration Options

### Retry Settings

```typescript
ExceptionHandlerWrapper.configureRetrySettings('operationKey', maxRetries, baseDelay);
```

- `operationKey`: Unique identifier for the operation
- `maxRetries`: Maximum number of retry attempts (default: 3)
- `baseDelay`: Base delay in milliseconds for exponential backoff (default: 1000)

### Circuit Breaker Management

```typescript
// Reset a circuit breaker
ExceptionHandlerWrapper.resetCircuitBreaker(errorKey);

// Check circuit breaker status
const status = ExceptionHandlerWrapper.getCircuitBreakerStatus(errorKey);
```

## Error Analysis Integration

The framework integrates with the existing error analysis capabilities:

```typescript
const result = await ExceptionHandlerWrapper.handleException({
    error: new Error('Database connection failed'),
    component: 'DatabaseService',
    operation: 'connect',
    severity: ErrorSeverity.CRITICAL
});

// The result may include remediation guidance from the analysis
if (result.remediationGuidance) {
    console.log('Remediation guidance:', result.remediationGuidance);
}
```

## Best Practices

### 1. Use Appropriate Severity Levels

- **INFO**: Informational messages that don't indicate problems
- **WARNING**: Potential issues that don't prevent operation
- **ERROR**: Problems that prevent normal operation
- **CRITICAL**: System-wide issues requiring immediate attention
- **VALIDATION**: User input validation failures

### 2. Provide Meaningful Context

Always include relevant contextual data:

```typescript
contextualData: {
    userId: 'user123',
    operation: 'fileUpload',
    fileSize: 1024,
    retryCount: 2
}
```

### 3. Use Standard Error Codes

Leverage the predefined error codes in `GlobalErrorCodes` for consistency.

### 4. Handle Wrapper Exceptions

Wrapper operations can still throw exceptions when handling fails:

```typescript
try {
    const result = await ExceptionHandlerWrapper.wrapAsyncOperation(...);
} catch (error) {
    // Handle cases where exception handling itself fails
    console.error('Exception handling failed:', error);
}
```

### 5. Configure Retry Settings Appropriately

Different operations may need different retry configurations:

- **Database operations**: Higher max retries, longer base delay
- **API calls**: Medium retries, medium delay  
- **File operations**: Lower retries, shorter delay

## Performance Considerations

### Overhead

The framework adds minimal overhead to normal operations:
- **Success case**: Only adds wrapper function call overhead
- **Error case**: Adds classification and strategy selection overhead

### Circuit Breaker Impact

Circuit breakers prevent repeated failures from consuming resources:
- Automatically opens when max retries are exceeded
- Prevents further attempts until manually reset
- Reduces load on failing systems

### Memory Usage

- Error context and results are stored temporarily during handling
- Circuit breaker state is maintained in memory
- No significant memory overhead for normal operations

## Monitoring and Observability

The framework enhances monitoring capabilities:

### Logged Information

- Error classification and type
- Selected handling strategy
- Recovery success/failure
- Contextual data
- Timestamps and trace IDs

### Integration Points

- All errors flow through centralized logging
- Structured error format for easy parsing
- Trace IDs for correlation across services
- Severity levels for filtering and alerting

## Future Enhancements

### Planned Features

1. **Automatic Circuit Breaker Reset**: Time-based or health-check based reset
2. **Strategy Customization**: Allow custom strategies for specific components
3. **Performance Metrics**: Track handling performance and success rates
4. **Alerting Integration**: Direct integration with monitoring systems
5. **Recovery Scripts**: Support for automated recovery actions

### Potential Extensions

1. **Machine Learning Integration**: Use ML to improve error classification
2. **Historical Analysis**: Learn from past error patterns
3. **Predictive Failure Prevention**: Anticipate and prevent errors
4. **Automated Remediation**: Execute recovery actions automatically

## Migration Guide

### For Existing Components

1. **Identify Error-Prone Operations**: Find operations that currently have try-catch blocks
2. **Replace with Wrappers**: Use `wrapAsyncOperation` or `wrapSyncOperation`
3. **Update Error Codes**: Use standardized error codes from `GlobalErrorCodes`
4. **Add Contextual Data**: Include relevant context for better error handling
5. **Test Thoroughly**: Verify error handling behavior matches expectations

### Example Migration

**Before:**
```typescript
try {
    const data = await fetchDataFromAPI();
    return processData(data);
} catch (error) {
    console.error('API call failed:', error);
    if (error.code === 'ETIMEDOUT') {
        // Retry logic
    } else if (error.response?.status === 404) {
        // Not found handling
    }
    throw error;
}
```

**After:**
```typescript
return ExceptionHandlerWrapper.wrapAsyncOperation(
    'fetchAndProcessData',
    'DataProcessor',
    async () => {
        const data = await fetchDataFromAPI();
        return processData(data);
    },
    ErrorSeverity.ERROR,
    'DATA_PROCESSING_FAILED'
);
```

## Conclusion

The centralized exception handling framework provides a robust, consistent approach to handling errors across the CKTMCS platform. By implementing this framework, the system benefits from:

- **Improved reliability** through better error recovery
- **Consistent error handling** across all components
- **Reduced boilerplate** code for common error scenarios
- **Enhanced monitoring** and observability
- **Intelligent strategy selection** based on error characteristics
- **Better user experience** through appropriate error feedback

The framework is designed to be gradually adopted, allowing components to be migrated incrementally while maintaining backward compatibility.