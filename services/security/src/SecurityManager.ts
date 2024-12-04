import express from 'express';
import passport from 'passport';
import cors from 'cors';
import { configurePassport } from './config/passport';
import { authRoutes } from './routes/auth';
import { userRoutes } from './routes/user';
import { errorHandler } from './middleware/errorHandler';
import bodyParser from 'body-parser';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { verifyComponentCredentials } from './models/jwtAuth';

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
        app.use(cors());
        app.use(bodyParser.json());
        app.use(bodyParser.urlencoded({ extended: true }));
        app.use((req, res, next) => {
            console.log('Received request:');
            console.log('Method:', req.method);
            console.log('URL:', req.url);
            console.log('Headers:', JSON.stringify(req.headers));
            console.log('Parsed Body:', JSON.stringify(req.body));
            next();
        });
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

        app.post('/auth/service', authServiceLimiter, async (req, res) => {
            const { componentType, clientSecret } = req.body;

            // Verify the component's credentials (you'll need to implement this)
            if (await verifyComponentCredentials(componentType, clientSecret)) {
                const token = jwt.sign(
                    { componentType },
                    process.env.JWT_SECRET || 'your-secret-key',
                    { expiresIn: '1h' }
                );
                res.json({ authenticated: true, token });
            } else {
                res.status(401).json({ authenticated: false, message: 'Invalid credentials' });
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