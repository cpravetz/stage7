import express from 'express';
import passport from 'passport';
import cors from 'cors';
import { configurePassport } from './config/passport';
import { authRoutes } from './routes/auth';
import { userRoutes } from './routes/user';
import { errorHandler } from './middleware/errorHandler';
import bodyParser from 'body-parser';
import OAuth2Server  from 'oauth2-server';
import { OAuthModel } from './models/OAuth';
import rateLimit from 'express-rate-limit';

const app = express();
export class SecurityManager {
    private port: string;
    private oauth: OAuth2Server;


    constructor() {
        this.port = process.env.PORT || '5010';
        this.configureMiddleware();
        this.configurePassport();
        this.oauth = new OAuth2Server({
            model: OAuthModel,
            accessTokenLifetime: 60 * 60, // 1 hour
            refreshTokenLifetime: 60 * 60 * 24 * 14, // 2 weeks
            allowBearerTokensInQueryString: false,
            allowEmptyState: false,
            allowExtendedTokenAttributes: true,
            authorizationCodeLifetime: 5 * 60 // 5 minutes
        });
        this.configureOAuth();
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

    private configureOAuth() {
        app.post('/oauth/token', bodyParser.urlencoded({ extended: true }), (req, res, next) => {
            console.log('Received token request:', req.body);
            const request = new OAuth2Server.Request(req);
            const response = new OAuth2Server.Response(res);

            this.oauth.token(request, response)
                .then((token) => {
                    console.log('Token generated successfully:', token);
                    res.json(token);
                })
                .catch((error) => {
                    console.error('Error generating token:', error);
                    next(error);
                });
        });
    }

    private configureRoutes() {
        app.use('/', authRoutes);
        app.use('/', userRoutes);
        const authServiceLimiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 100, // Limit each IP to 100 requests per windowMs
            message: 'Too many authentication requests, please try again later.'
        });

        app.post('/auth/service', authServiceLimiter, (req, res, next) => {
            const request = new OAuth2Server.Request(req);
            const response = new OAuth2Server.Response(res);

            this.oauth.authenticate(request, response)
                .then((token) => {
                    res.json({ authenticated: true, token });
                })
                .catch(next);
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