import express from 'express';
import passport from 'passport';
import cors from 'cors';
import { configurePassport } from './config/passport';
import { authRoutes } from './routes/auth';
import { userRoutes } from './routes/user';
import { errorHandler } from './middleware/errorHandler';
import bodyParser from 'body-parser';

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
        app.use('/', authRoutes);
    }

    private configurePassport() {
        configurePassport(passport);
    }

    private configureRoutes() {
        app.use('/', authRoutes);
        app.use('/', userRoutes);
        app.use(errorHandler);
    }

    public start() {
        app.listen(this.port, () => {
            console.log(`SecurityManager listening on port ${this.port}`);
        });
    }
}

new SecurityManager().start();