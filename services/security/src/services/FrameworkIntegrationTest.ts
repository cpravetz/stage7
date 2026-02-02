import { SecurityAuditService } from './SecurityAuditService';
import { SecurityMonitoringService } from './SecurityMonitoringService';
import { FrameworkIntegrationService } from './FrameworkIntegrationService';
import { ReliabilityLogger } from '@cktmcs/shared';

/**
 * Framework Integration Test - Demonstrates the integrated reliability and security framework
 */
export class FrameworkIntegrationTest {
    private logger: ReliabilityLogger;
    private auditService: SecurityAuditService;
    private monitoringService: SecurityMonitoringService;
    private integrationService: FrameworkIntegrationService;

    constructor() {
        this.logger = new ReliabilityLogger('FrameworkIntegrationTest');
        this.auditService = new SecurityAuditService();
        this.monitoringService = new SecurityMonitoringService();
        this.integrationService = new FrameworkIntegrationService(this.auditService, this.monitoringService);
    }

    /**
     * Run comprehensive framework integration test
     */
    public async runTest(): Promise<IntegrationTestResult> {
        try {
            this.logger.info('Starting framework integration test');
            
            const results: IntegrationTestResult = {
                timestamp: new Date().toISOString(),
                testResults: [],
                success: false,
                message: ''
            };
            
            // Test 1: Framework Integration
            this.logger.info('Test 1: Performing framework integration');
            const integrationResult = this.integrationService.performFullIntegration();
            results.testResults.push({
                testName: 'Framework Integration',
                success: integrationResult.success,
                details: `Success count: ${integrationResult.successCount}/${integrationResult.totalIntegrations}`
            });
            
            // Test 2: Security Audit Logging
            this.logger.info('Test 2: Testing security audit logging');
            const auditTestResult = this.testAuditLogging();
            results.testResults.push(auditTestResult);
            
            // Test 3: Security Monitoring
            this.logger.info('Test 3: Testing security monitoring');
            const monitoringTestResult = this.testSecurityMonitoring();
            results.testResults.push(monitoringTestResult);
            
            // Test 4: Cross-Component Integration
            this.logger.info('Test 4: Testing cross-component integration');
            const crossComponentTestResult = this.testCrossComponentIntegration();
            results.testResults.push(crossComponentTestResult);
            
            // Calculate overall success
            const successCount = results.testResults.filter(r => r.success).length;
            const totalTests = results.testResults.length;
            results.success = successCount === totalTests;
            results.message = `Integration test ${results.success ? 'passed' : 'failed'} - ${successCount}/${totalTests} tests successful`;
            
            this.logger.info(`Framework integration test completed: ${results.message}`);
            
            return results;
        } catch (error) {
            this.logger.error('Framework integration test failed:', error);
            return {
                timestamp: new Date().toISOString(),
                testResults: [],
                success: false,
                message: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    private testAuditLogging(): TestResult {
        try {
            // Log some test audit events
            const testEvents = [
                {
                    eventType: 'AUTHENTICATION_SUCCESS',
                    severity: 'info' as const,
                    userId: 'test-user-1',
                    service: 'TestService',
                    operation: 'login',
                    details: { method: 'password', success: true }
                },
                {
                    eventType: 'AUTHENTICATION_FAILED',
                    severity: 'high' as const,
                    userId: 'test-user-2',
                    service: 'TestService',
                    operation: 'login',
                    ipAddress: '192.168.1.100',
                    details: { method: 'password', attempts: 3 }
                },
                {
                    eventType: 'DATA_ACCESS',
                    severity: 'medium' as const,
                    userId: 'test-user-1',
                    service: 'TestService',
                    operation: 'readData',
                    dataType: 'sensitive' as const,
                    details: { dataType: 'userData', accessLevel: 'read' }
                }
            ];
            
            testEvents.forEach(event => {
                this.auditService.logAuditEvent(event);
            });
            
            // Verify audit logs were created
            const auditLogs = this.auditService.getAuditLogs();
            const success = auditLogs.length >= testEvents.length;
            
            return {
                testName: 'Security Audit Logging',
                success,
                details: `Logged ${auditLogs.length} audit events`
            };
        } catch (error) {
            this.logger.error('Audit logging test failed:', error);
            return {
                testName: 'Security Audit Logging',
                success: false,
                details: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    private testSecurityMonitoring(): TestResult {
        try {
            // Start monitoring service
            this.monitoringService.start();
            
            // Process some test security events
            const testEvents = [
                {
                    eventType: 'AUTHENTICATION_FAILED',
                    severity: 'high' as const,
                    service: 'TestService',
                    userId: 'test-user-3',
                    ipAddress: '192.168.1.101',
                    details: { attempts: 5, method: 'password' }
                },
                {
                    eventType: 'AUTHORIZATION_FAILED',
                    severity: 'critical' as const,
                    service: 'TestService',
                    operation: 'admin.access',
                    userId: 'test-user-4',
                    details: { requestedPermission: 'admin', currentRole: 'user' }
                }
            ];
            
            testEvents.forEach(event => {
                this.monitoringService.processSecurityEvent(event);
            });
            
            // Check if alerts were generated
            const alerts = this.monitoringService.getSecurityAlerts();
            const success = alerts.length > 0;
            
            return {
                testName: 'Security Monitoring',
                success,
                details: `Generated ${alerts.length} security alerts`
            };
        } catch (error) {
            this.logger.error('Security monitoring test failed:', error);
            return {
                testName: 'Security Monitoring',
                success: false,
                details: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    private testCrossComponentIntegration(): TestResult {
        try {
            // Test the integration between audit and monitoring services
            const auditEvent = {
                eventType: 'SECURITY_EVENT',
                severity: 'high' as const,
                service: 'IntegrationTest',
                operation: 'crossComponentTest',
                details: { test: 'crossComponentIntegration' }
            };
            
            // Log to audit service
            this.auditService.logAuditEvent(auditEvent);
            
            // Process through monitoring service
            this.monitoringService.processSecurityEvent(auditEvent);
            
            // Check both services have records
            const auditLogs = this.auditService.getAuditLogs();
            const securityAlerts = this.monitoringService.getSecurityAlerts();
            
            const success = auditLogs.length > 0 && securityAlerts.length > 0;
            
            return {
                testName: 'Cross-Component Integration',
                success,
                details: `Audit logs: ${auditLogs.length}, Security alerts: ${securityAlerts.length}`
            };
        } catch (error) {
            this.logger.error('Cross-component integration test failed:', error);
            return {
                testName: 'Cross-Component Integration',
                success: false,
                details: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * Get comprehensive test report
     */
    public getTestReport(): IntegrationTestReport {
        return {
            framework: 'CKTMCS Reliability and Security Framework',
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            components: [
                {
                    name: 'Reliability Framework',
                    status: 'Implemented',
                    features: [
                        'Health Monitoring',
                        'Circuit Breaker Pattern',
                        'Retry Management',
                        'Monitoring & Metrics'
                    ]
                },
                {
                    name: 'Security Framework',
                    status: 'Enhanced',
                    features: [
                        'Security Audit Service',
                        'Security Monitoring Service',
                        'Framework Integration Service',
                        'Comprehensive Policy Management'
                    ]
                },
                {
                    name: 'Integration Layer',
                    status: 'Complete',
                    features: [
                        'Cross-framework communication',
                        'Unified monitoring',
                        'Coordinated protective measures',
                        'Comprehensive API'
                    ]
                }
            ],
            integrationPoints: [
                'Error Handling Framework',
                'Policy Management System',
                'Existing Services (MissionControl, Brain, etc.)',
                'Reliability Framework',
                'Security Services'
            ],
            securityMeasures: [
                'Comprehensive security auditing',
                'Real-time security monitoring',
                'Threat detection and alerting',
                'Policy compliance monitoring',
                'Cross-cutting security controls'
            ],
            reliabilityMeasures: [
                'Service health monitoring',
                'Circuit breaker pattern implementation',
                'Intelligent retry management',
                'Comprehensive metrics collection',
                'Resilience pattern implementation'
            ]
        };
    }
}

// Type definitions
export interface IntegrationTestResult {
    timestamp: string;
    testResults: TestResult[];
    success: boolean;
    message: string;
}

export interface TestResult {
    testName: string;
    success: boolean;
    details: string;
}

export interface IntegrationTestReport {
    framework: string;
    version: string;
    timestamp: string;
    components: {
        name: string;
        status: string;
        features: string[];
    }[];
    integrationPoints: string[];
    securityMeasures: string[];
    reliabilityMeasures: string[];
}