import express, { Request, Response } from 'express';
import passport from 'passport';
import cors from 'cors';
import { configurePassport } from './config/passport';
import { authRoutes } from './routes/auth';
import { userRoutes } from './routes/user';
import { errorHandler } from './middleware/errorHandler';
import bodyParser from 'body-parser';
import rateLimit from 'express-rate-limit';
import { authenticateService, verifyToken } from './models/jwtAuth';

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
        app.use('/', authRoutes);
        app.use('/', userRoutes);

        const authServiceLimiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 100, // Limit each IP to 100 requests per windowMs
            message: 'Too many authentication requests, please try again later.'
        });

        app.post('/auth/service', authServiceLimiter, async (req: Request, res: Response) => {
            console.log('Received authentication request from component');
            console.log('Request body:', JSON.stringify(req.body));

            const { componentType, clientSecret } = req.body;
            console.log(`Component type: ${componentType}, Client secret provided: ${clientSecret ? 'Yes' : 'No'}`);

            try {
                const token = await authenticateService(componentType, clientSecret);
                if (token) {
                    console.log(`Generated token for ${componentType}`);
                    res.json({ authenticated: true, token });
                } else {
                    console.error(`Authentication failed for ${componentType}`);
                    res.status(401).json({ authenticated: false, error: 'Invalid credentials' });
                }
            } catch (error) {
                console.error(`Error authenticating ${componentType}:`, error);
                res.status(500).json({ authenticated: false, error: 'Authentication service error' });
            }
        });

        // Add endpoint to verify tokens
        app.post('/verify', (req: any, res: any) => {
            console.log('Received token verification request');
            const authHeader = req.headers.authorization;
            console.log('Authorization header:', authHeader);

            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({ valid: false, error: 'No token provided' });
            }

            const token = authHeader.split(' ')[1];
            const decoded = verifyToken(token);

            if (decoded) {
                console.log('Token verified successfully:', decoded);
                return res.status(200).json({
                    valid: true,
                    user: decoded
                });
            } else {
                console.error('Invalid token');
                return res.status(401).json({ valid: false, error: 'Invalid token' });
            }
        });

        app.use(errorHandler);
    }


    public start() {
        app.listen(this.port, () => {
            console.log(`SecurityManager listening on port ${this.port}`);
        });
    }

}

new SecurityManager().start();