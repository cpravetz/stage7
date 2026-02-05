import { ExceptionHandlerWrapper, ErrorSeverity } from '../errorhandler/src/index';

/**
 * Example demonstrating how to integrate the centralized exception handling
 * with existing codebase components.
 */

// Example 1: Wrapping an async operation
async function demonstrateAsyncOperation() {
    console.log('=== Demonstrating Async Operation Wrapping ===');
    
    try {
        const result = await ExceptionHandlerWrapper.wrapAsyncOperation(
            'fetchData',
            'DataService',
            async () => {
                // Simulate an operation that might fail
                if (Math.random() > 0.5) {
                    throw new Error('Network timeout occurred');
                }
                return { data: 'success' };
            },
            ErrorSeverity.ERROR,
            'DATA_FETCH_FAILED'
        );
        
        console.log('Operation succeeded:', result);
    } catch (error) {
        console.error('Operation failed with structured error:', error);
    }
}

// Example 2: Wrapping a sync operation
function demonstrateSyncOperation() {
    console.log('\n=== Demonstrating Sync Operation Wrapping ===');
    
    try {
        const result = ExceptionHandlerWrapper.wrapSyncOperation(
            'parseConfig',
            'ConfigService',
            () => {
                // Simulate a sync operation that might fail
                if (Math.random() > 0.5) {
                    throw new Error('Invalid configuration format');
                }
                return { config: 'parsed' };
            },
            ErrorSeverity.VALIDATION,
            'CONFIG_PARSE_FAILED'
        );
        
        console.log('Operation succeeded:', result);
    } catch (error) {
        console.error('Operation failed with fallback error:', error);
    }
}

// Example 3: Direct exception handling
async function demonstrateDirectHandling() {
    console.log('\n=== Demonstrating Direct Exception Handling ===');
    
    try {
        // Simulate an operation that fails
        throw new Error('Database connection failed');
    } catch (error) {
        const result = await ExceptionHandlerWrapper.handleException({
            error,
            component: 'DatabaseService',
            operation: 'connectToDatabase',
            severity: ErrorSeverity.CRITICAL,
            errorCode: 'DB_CONNECTION_FAILED',
            contextualData: {
                database: 'main_db',
                retryCount: 0
            }
        });
        
        console.log('Exception handling result:', {
            handled: result.handled,
            strategyUsed: result.strategyUsed,
            recoverySuccessful: result.recoverySuccessful,
            remediationGuidance: result.remediationGuidance?.substring(0, 100) + '...'
        });
    }
}

// Example 4: Error classification
function demonstrateErrorClassification() {
    console.log('\n=== Demonstrating Error Classification ===');
    
    const errors = [
        new Error('Network timeout occurred'),
        new Error('Invalid input format'),
        new Error('Database connection refused'),
        new Error('Missing required field: username')
    ];
    
    errors.forEach((error, index) => {
        const errorType = ExceptionHandlerWrapper.classifyError(error);
        console.log(`Error ${index + 1}: "${error.message}" -> Type: ${errorType}`);
    });
}

// Example 5: Configuration and circuit breaker management
function demonstrateConfiguration() {
    console.log('\n=== Demonstrating Configuration ===');
    
    // Configure retry settings for specific operations
    ExceptionHandlerWrapper.configureRetrySettings('databaseOperations', 5, 2000);
    ExceptionHandlerWrapper.configureRetrySettings('apiCalls', 3, 1000);
    
    console.log('Configured retry settings for databaseOperations and apiCalls');
    
    // Demonstrate circuit breaker management
    const errorKey = 'DatabaseService:connectToDatabase:transient';
    ExceptionHandlerWrapper.resetCircuitBreaker(errorKey);
    console.log('Reset circuit breaker for:', errorKey);
}

// Run all demonstrations
async function runDemonstrations() {
    console.log('Starting Exception Handling Integration Demonstrations\n');
    
    await demonstrateAsyncOperation();
    demonstrateSyncOperation();
    await demonstrateDirectHandling();
    demonstrateErrorClassification();
    demonstrateConfiguration();
    
    console.log('\n=== All Demonstrations Complete ===');
}

// Run the demonstrations
runDemonstrations().catch(console.error);