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

        app.post('/auth/service', authServiceLimiter, async (req, res) => {
            const { componentType, clientSecret } = req.body;

            // Verify the component's credentials (you'll need to implement this)
            if (process.env.JWT_SECRET && await verifyComponentCredentials(componentType, clientSecret)) {
                const token = jwt.sign(
                    { componentType },
                    process.env.JWT_SECRET,
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