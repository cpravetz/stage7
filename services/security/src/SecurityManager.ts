import express from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/errorHandler';
import bodyParser from 'body-parser';
import rateLimit from 'express-rate-limit';
import { authenticateService, verifyToken } from './models/jwtAuth';
import * as fs from 'fs';
import * as path from 'path';
import { analyzeError } from '@cktmcs/shared';
import { refreshToken, register, login, logout } from './controllers/authController';
import { BaseEntity } from '@cktmcs/shared';
import { initUserService, createUser, findUserByEmail } from './services/userService';
import { SecurityAuditService } from './services/SecurityAuditService';
import { SecurityMonitoringService } from './services/SecurityMonitoringService';
import { FrameworkIntegrationService } from './services/FrameworkIntegrationService';

// Define Request and Response types for consistency
type Request = express.Request;
type Response = express.Response;

const app = express();
export class SecurityManager extends BaseEntity {
    private securityAuditService: SecurityAuditService;
    private securityMonitoringService: SecurityMonitoringService;
    private frameworkIntegrationService: FrameworkIntegrationService;

    constructor() {
        super('SecurityManager', 'SecurityManager', 'securitymanager', process.env.PORT || '5010');

        // Initialize security services
        this.securityAuditService = new SecurityAuditService();
        this.securityMonitoringService = new SecurityMonitoringService();
        this.frameworkIntegrationService = new FrameworkIntegrationService(
            this.securityAuditService,
            this.securityMonitoringService
        );
        
        // Start security monitoring
        this.securityMonitoringService.start();

        // Perform framework integration
        this.performFrameworkIntegration();

        // Initialize user service with this SecurityManager instance
        initUserService(this);

        // Provision a default admin user if one doesn't exist
        //this.provisionDefaultAdminUser();

        this.configureMiddleware();
        this.configureRoutes();
    }

    private async provisionDefaultAdminUser() {
        const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com';
        const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'adminpassword'; // In a real app, hash this!

        try {
            const existingAdmin = await findUserByEmail(ADMIN_EMAIL);
            if (!existingAdmin) {
                console.log('No default admin user found. Creating one...');
                await createUser({
                    email: ADMIN_EMAIL,
                    password: ADMIN_PASSWORD,
                    roles: ['admin', 'user'], // Assign appropriate roles
                    permissions: [] // Assign appropriate permissions
                });
                console.log(`Default admin user "${ADMIN_EMAIL}" created successfully.`);
            } else {
                console.log(`Default admin user "${ADMIN_EMAIL}" already exists.`);
            }
        } catch (error) {
            analyzeError(error as Error);
            console.error('Error provisioning default admin user:', error);
        }
    }

    private configureMiddleware() {
        const limiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 5000, // max 5000 requests per windowMs
        });
        app.use(limiter);
        app.use(cors());
        app.use(bodyParser.json());
        app.use(bodyParser.urlencoded({ extended: true }));
    }

    private configureRoutes() {
        // Service authentication endpoint
        const authServiceLimiter = rateLimit({
            windowMs: 60 * 1000, // 15 minutes
            max: 1000, // Limit each IP to 1000 requests per windowMs
            message: 'Too many authentication requests, please try again later.'
        });

        // Service authentication endpoint
        app.post('/auth/service', authServiceLimiter, async (req: Request, res: Response) => {
            try {
                console.log('Received authentication request from component');
                console.log('Request body:', JSON.stringify(req.body));

                const { componentType, clientSecret } = req.body;
                console.log(`Component type: ${componentType}, Client secret provided: ${clientSecret ? 'Yes' : 'No'}`);

                // Authenticate the service
                const token = await authenticateService(componentType, clientSecret);
                if (!token) {
                    res.status(401).json({ error: 'Authentication failed' });
                    return;
                }

                // Return the token in the format expected by BaseEntity
                res.status(200).json({ authenticated: true, token: token });
            } catch (error) {
                analyzeError(error as Error);
                console.error('Error authenticating service:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        // Token verification endpoint
        app.post('/verify', async (req: Request, res: Response) => {
            try {
      
                // Get token from Authorization header
                const authHeader = req.headers.authorization;
                if (!authHeader) {
                    console.error('[SM] No authorization header provided');
                    res.status(400).json({ valid: false, error: '[SM] No authorization token provided' });
                    return;
                }

                // Extract token from Authorization header
                const parts = authHeader.split(' ');
                if (parts.length !== 2 || parts[0] !== 'Bearer') {
                    console.error('Invalid authorization header format');
                    res.status(400).json({ valid: false, error: 'Invalid authorization header format' });
                    return;
                }

                const token = parts[1];

                // Also check for token in request body as fallback
                const bodyToken = req.body.token;
                const tokenToVerify = token || bodyToken;

                if (!tokenToVerify) {
                    console.error('No token provided in header or body');
                    res.status(400).json({ valid: false, error: 'Token is required' });
                    return;
                }

                const decoded = verifyToken(tokenToVerify);
                if (!decoded) {
                    console.error('Invalid or expired token');
                    res.status(401).json({ valid: false, error: 'Invalid token' });
                    return;
                }

                //console.log('Token verified successfully');
                res.status(200).json({ valid: true, user: decoded });
            } catch (error) {
                analyzeError(error as Error);
                console.error('Error verifying token:', error);
                res.status(500).json({ valid: false, error: 'Internal server error' });
            }
        });

        // Add endpoint to get public key
        app.get('/public-key', (_req: Request, res: Response) => {
            try {
                console.log('[SecurityManager] Received request for public key');

                // Check multiple possible locations for the public key
                const possiblePaths = [
                    path.join(__dirname, '../keys/public.key'),
                    path.join(__dirname, '../keys/public.pem'),
                    path.join(process.cwd(), 'keys/public.key'),
                    path.join(process.cwd(), 'keys/public.pem')
                ];

                console.log('[SecurityManager] Checking for public key in these locations:', possiblePaths);

                let publicKey = null;
                let foundPath = null;

                for (const publicKeyPath of possiblePaths) {
                    if (fs.existsSync(publicKeyPath)) {
                        publicKey = fs.readFileSync(publicKeyPath, 'utf8');
                        foundPath = publicKeyPath;
                        break;
                    }
                }

                if (publicKey) {
                    console.log(`[SecurityManager] Serving public key from file: ${foundPath}`);
                    console.log(`[SecurityManager] Public key content (first 40 chars): ${publicKey.substring(0, 40)}...`);
                    res.set('Content-Type', 'text/plain');
                    res.send(publicKey);
                } else {
                    console.error('[SecurityManager] Public key file not found in any of the expected locations');

                    // Try to generate a new key pair if no public key is found
                    try {
                        console.log('[SecurityManager] Attempting to generate new key pair...');
                        const { execSync } = require('child_process');
                        execSync('node scripts/fix-auth-keys.js', { stdio: 'inherit' });

                        // Try to read the newly generated public key
                        if (fs.existsSync(path.join(__dirname, '../keys/public.key'))) {
                            const newPublicKey = fs.readFileSync(path.join(__dirname, '../keys/public.key'), 'utf8');
                            console.log('[SecurityManager] Serving newly generated public key');
                            res.set('Content-Type', 'text/plain');
                            res.send(newPublicKey);
                            return;
                        }
                    } catch (genError) {
                        console.error('[SecurityManager] Failed to generate new key pair:', genError);
                    }

                    res.status(500).json({ error: 'Public key not available' });
                }
            } catch (error) {
                analyzeError(error as Error);
                console.error('[SecurityManager] Error serving public key:', error);
                res.status(500).json({ error: 'Failed to serve public key' });
            }
        });



        // Refresh token endpoint
        app.post('/auth/refresh-token', refreshToken);

        // Register endpoint
        app.post('/register', register);

        app.post('/login', login);
        
        app.post('/logout', logout);

        // Set up unified health check endpoints (/health, /healthy, /ready, /status)
        this.setupHealthCheck(app);

        // Security audit endpoints
        app.post('/audit/log', async (req: Request, res: Response) => {
            try {
                const auditEvent = req.body;
                this.securityAuditService.logAuditEvent(auditEvent);
                res.status(200).json({ success: true, message: 'Audit event logged successfully' });
            } catch (error) {
                analyzeError(error as Error);
                console.error('Error logging audit event:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        app.get('/audit/logs', async (req: Request, res: Response) => {
            try {
                const filter = req.query;
                const logs = this.securityAuditService.getAuditLogs(filter as any);
                res.status(200).json(logs);
            } catch (error) {
                analyzeError(error as Error);
                console.error('Error getting audit logs:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        app.get('/audit/compliance', async (req: Request, res: Response) => {
            try {
                const report = this.securityAuditService.generateComplianceReport();
                res.status(200).json(report);
            } catch (error) {
                analyzeError(error as Error);
                console.error('Error generating compliance report:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        // Security monitoring endpoints
        app.post('/monitor/event', async (req: Request, res: Response) => {
            try {
                const securityEvent = req.body;
                this.securityMonitoringService.processSecurityEvent(securityEvent);
                res.status(200).json({ success: true, message: 'Security event processed successfully' });
            } catch (error) {
                analyzeError(error as Error);
                console.error('Error processing security event:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        app.get('/monitor/alerts', async (req: Request, res: Response) => {
            try {
                const filter = req.query;
                const alerts = this.securityMonitoringService.getSecurityAlerts(filter as any);
                res.status(200).json(alerts);
            } catch (error) {
                analyzeError(error as Error);
                console.error('Error getting security alerts:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        app.get('/monitor/status', async (req: Request, res: Response) => {
            try {
                const status = this.securityMonitoringService.getStatus();
                res.status(200).json(status);
            } catch (error) {
                analyzeError(error as Error);
                console.error('Error getting monitoring status:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        // Security status endpoint
        app.get('/security/status', async (req: Request, res: Response) => {
            try {
                const status = this.getSecurityStatus();
                res.status(200).json(status);
            } catch (error) {
                analyzeError(error as Error);
                console.error('Error getting security status:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        // Framework integration endpoints
        app.get('/integration/status', async (req: Request, res: Response) => {
            try {
                const status = this.frameworkIntegrationService.getStatus();
                res.status(200).json(status);
            } catch (error) {
                analyzeError(error as Error);
                console.error('Error getting integration status:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        app.post('/integration/perform', async (req: Request, res: Response) => {
            try {
                const result = this.frameworkIntegrationService.performFullIntegration();
                res.status(200).json(result);
            } catch (error) {
                analyzeError(error as Error);
                console.error('Error performing integration:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        // Error handler
        app.use(errorHandler);
    }


    private performFrameworkIntegration() {
        try {
            const result = this.frameworkIntegrationService.performFullIntegration();
            if (result.success) {
                console.log('Framework integration completed successfully');
            } else {
                console.warn('Framework integration completed with some failures:', result);
            }
        } catch (error) {
            analyzeError(error as Error);
            console.error('Failed to perform framework integration:', error);
        }
    }

    public getSecurityStatus() {
        return {
            service: 'SecurityManager',
            status: 'running',
            timestamp: new Date().toISOString(),
            components: {
                securityAuditService: this.securityAuditService.getStatus(),
                securityMonitoringService: this.securityMonitoringService.getStatus(),
                frameworkIntegrationService: this.frameworkIntegrationService.getStatus()
            }
        };
    }

    public start() {
        app.listen(this.port, () => {
            console.log(`SecurityManager listening on port ${this.port}`);
        });
    }

}

// Add middleware to verify tokens for plugin authentication
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    // Update exempt paths to include refresh-token route
const exemptPaths = ['/auth/', '/auth/service', '/verify', '/public-key', '/health', '/login', '/register', '/refresh-token'];

    // Update middleware to match paths more flexibly
    if (exemptPaths.some(path => req.path.startsWith(path))) {
        //console.log(`[SecurityManager] Skipping token verification for exempt path: ${req.path}`);
        return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) {
        console.error('[SecurityManager] No authorization header provided for ', req.path);
        res.status(401).json({ error: 'Authorization header is required' });
        return;
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
        console.error('[SecurityManager] Invalid authorization header format');
        res.status(401).json({ error: 'Invalid authorization header format' });
        return;
    }

    const token = parts[1];
    const decoded = verifyToken(token);
    if (!decoded) {
        console.error('[SecurityManager] Invalid or expired token');
        res.status(401).json({ error: 'Invalid or expired token' });
        return;
    }

    //console.log('[SecurityManager] Token verified successfully');
    req.user = decoded;
    next();
});

new SecurityManager().start();