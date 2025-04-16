import express, { Request, Response, NextFunction } from 'express';
import passport from 'passport';
import cors from 'cors';
import { configurePassport } from './config/passport';
import { authRoutes } from './routes/auth';
import { userRoutes } from './routes/user';
import { errorHandler } from './middleware/errorHandler';
import bodyParser from 'body-parser';
import rateLimit from 'express-rate-limit';
import { authenticateService, verifyToken } from './models/jwtAuth';
import * as fs from 'fs';
import * as path from 'path';
import { analyzeError } from '@cktmcs/errorhandler';
import { token, authenticate, verifyToken as oauthVerifyToken } from './oauth/server';

const app = express();
export class SecurityManager {
    private port: string;


    constructor() {
        this.port = process.env.PORT || '5010';
        this.configureMiddleware();
        this.configurePassport();
        this.configureRoutes();
    }

    private configureMiddleware() {
        const limiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 1000, // max 100 requests per windowMs
        });
        app.use(limiter);
        app.use(cors());
        app.use(bodyParser.json());
        app.use(bodyParser.urlencoded({ extended: true }));
    }

    private configurePassport() {
        configurePassport(passport);
    }

    private configureRoutes() {
        // Legacy routes for user authentication
        app.use('/', authRoutes);
        app.use('/', userRoutes);

        // OAuth 2.0 endpoints
        app.post('/oauth/token', token());

        // Legacy service authentication endpoint
        const authServiceLimiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 100, // Limit each IP to 100 requests per windowMs
            message: 'Too many authentication requests, please try again later.'
        });

        // Legacy service authentication endpoint that redirects to OAuth 2.0 token endpoint
        app.post('/auth/service', authServiceLimiter, (req: Request, res: Response, next: NextFunction) => {
            console.log('Received authentication request from component');
            console.log('Request body:', JSON.stringify(req.body));

            const { componentType, clientSecret } = req.body;
            console.log(`Component type: ${componentType}, Client secret provided: ${clientSecret ? 'Yes' : 'No'}`);

            // Convert legacy request to OAuth 2.0 request
            req.body = {
                grant_type: 'client_credentials',
                client_id: componentType,
                client_secret: clientSecret
            };

            // Forward to OAuth 2.0 token endpoint
            next();
        }, token());

        // Token verification endpoint
        app.post('/verify', oauthVerifyToken());

        // Add endpoint to get public key
        app.get('/public-key', (req: Request, res: Response) => {
            try {
                const publicKeyPath = path.join(__dirname, '../keys/public.key');

                if (fs.existsSync(publicKeyPath)) {
                    const publicKey = fs.readFileSync(publicKeyPath, 'utf8');
                    console.log('Serving public key from file');
                    res.set('Content-Type', 'text/plain');
                    return res.send(publicKey);
                } else {
                    console.error('Public key file not found at', publicKeyPath);
                    return res.status(500).json({ error: 'Public key not available' });
                }
            } catch (error) {
                analyzeError(error as Error);
                console.error('Error serving public key:', error);
                return res.status(500).json({ error: 'Failed to serve public key' });
            }
        });

        // Health check endpoint
        app.get('/health', (req: Request, res: Response) => {
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

new SecurityManager().start();