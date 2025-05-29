import express from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/errorHandler';
import bodyParser from 'body-parser';
import rateLimit from 'express-rate-limit';
import { authenticateService, verifyToken } from './models/jwtAuth';
import * as fs from 'fs';
import * as path from 'path';
import { analyzeError } from '@cktmcs/errorhandler';
import { refreshToken, register, login, logout } from './controllers/authController';

// Define Request and Response types for consistency
type Request = express.Request;
type Response = express.Response;

const app = express();
export class SecurityManager {
    private port: string;

    constructor() {
        this.port = process.env.PORT || '5010';
        this.configureMiddleware();
        this.configureRoutes();
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
            windowMs: 15 * 60 * 1000, // 15 minutes
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

                console.log('Token verified successfully');
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

        // Health check endpoint
        app.get('/health', (_req: Request, res: Response) => {
            res.json({ status: 'ok', message: 'Security service is running' });
        });

        // Error handler
        app.use(errorHandler);
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
const exemptPaths = ['/auth/', '/verify', '/public-key', '/health', '/login', '/register', '/refresh-token'];

    // Update middleware to match paths more flexibly
    if (exemptPaths.some(path => req.path.startsWith(path))) {
        console.log(`[SecurityManager] Skipping token verification for exempt path: ${req.path}`);
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

    console.log('[SecurityManager] Token verified successfully');
    req.user = decoded;
    next();
});

new SecurityManager().start();