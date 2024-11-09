import express, { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { UnauthorizedError } from 'express-jwt';
import cors from 'cors';
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import { sign, verify } from 'jsonwebtoken';
import { expressjwt } from 'express-jwt';
import bcrypt from 'bcrypt';
import { BaseEntity } from '@cktmcs/shared';
import axios from 'axios';
import { CognitoIdentityProviderClient, InitiateAuthCommand, SignUpCommand } from "@aws-sdk/client-cognito-identity-provider";
import { analyzeError } from '@cktmcs/errorhandler';

// Types
interface User {
    id: string;
    username: string;
    email: string;
    password?: string;
    authProvider?: string;
    providerUserId?: string;
    role: string;
    lastLogin: Date;
    componentRegistrations?: string[];
}

interface RegisteredComponent {
    guid: string;
    name: string;
    type: string;
    url: string;
    registeredBy: string;
    registrationToken: string;
    registrationDate: Date;
    lastHeartbeat: Date;
}

interface OAuthUserData {
    email: string;
    username: string;
    providerUserId: string;
    authProvider: string;
}

interface DecodedToken {
    id: string;
    email: string;
    role: string;
    iat: number;
    exp: number;
}


export class SecurityManager extends BaseEntity {
    private readonly JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
    private readonly JWT_EXPIRES_IN = '24h';
    private readonly SALT_ROUNDS = 10;
    private librarianUrl: string;
    private cognitoClient?: CognitoIdentityProviderClient;

    constructor() {
        super('SecurityManager', 'SecurityManager', `securitymanager`, process.env.PORT || '5010');
        this.librarianUrl = process.env.LIBRARIAN_URL || 'librarian:5040';
        try {
            console.log('Constructing SecurityManager');
            this.setupServer();
            this.setupPassport();
            if (process.env.COGNITO_CLIENT_ID) {
                this.cognitoClient = new CognitoIdentityProviderClient({region: process.env.AWS_REGION || 'us-east-1'});
            }
        } catch (error) { analyzeError(error as Error);
            console.error('Failed to construct SecurityManager:', error instanceof Error ? error.message : error);
        }
    }

    
    private setupServer() {
        const app = express();

        const corsOptions = {
            origin: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'Access-Control-Allow-Origin', 'Access-Control-Allow-Headers'],
            credentials: true,
        };

        app.use(cors(corsOptions));
        app.use(express.json());
        app.use(passport.initialize());

        // JWT middleware
        const jwtMiddleware = expressjwt({
            secret: this.JWT_SECRET,
            algorithms: ['HS256'],
        }).unless({ path: ['/register', '/login', '/login/google', '/login/cognito', '/logout'] });

        app.use(jwtMiddleware);

        // Error handler for express-jwt
        const errorHandler: ErrorRequestHandler = (err: unknown, req: Request, res: Response, next: NextFunction) => {
            if (err instanceof UnauthorizedError) {
                console.error('JWT Error:', err.message);
                if ((err as any).inner?.name === 'TokenExpiredError') {
                    res.status(401).json({ error: 'Token has expired', code: 'TOKEN_EXPIRED' });
                } else {
                    res.status(401).json({ error: 'Invalid token', code: 'INVALID_TOKEN' });
                }
            } else {
                console.error('Unexpected error:', err);
                res.status(500).json({ error: 'An unexpected error occurred', code: 'INTERNAL_SERVER_ERROR' });
            }
            // Ensure we always call next() to properly end the middleware chain
            next();
        };

        app.use(errorHandler);

        // User Authentication Routes
        app.post('/register', (req, res) => { this.registerUser(req, res) });
        app.post('/login', (req, res) => { this.handleLogin(req, res) });
        app.post('/logout', (req, res) => { this.handleLogout(req, res) });
        app.post('/login/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
        if (process.env.COGNITO_CLIENT_ID) {
            app.post('/login/cognito', (req, res) => { this.handleCognitoLogin(req, res) });
        }
        app.get('/auth/verify', (req, res) => { this.verifyToken(req, res) });
        app.post('/refreshToken', (req, res) => { this.handleRefreshToken(req, res) });

        app.listen(this.port, () => {
            console.log(`SecurityManager listening on port ${this.port}`);
        });
    }

    private setupPassport() {
        // Local Strategy
        passport.use(new LocalStrategy({
            usernameField: 'email',
            passwordField: 'password'
        }, async (email, password, done) => {
            try {
                const user = await this.findUserByEmail(email);
                if (!user || !await bcrypt.compare(password, user.password!)) {
                    return done(null, false, { message: 'Invalid credentials' });
                }
                return done(null, user);
            } catch (error) { analyzeError(error as Error);
                return done(error);
            }
        }));

        // Google Strategy
        if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
            passport.use(new GoogleStrategy({
                clientID: process.env.GOOGLE_CLIENT_ID,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                callbackURL: '/auth/google/callback'
            }, async (accessToken, refreshToken, profile, done) => {
                try {
                    let user = await this.findUserByProviderId('google', profile.id);
                    if (!user) {
                        user = await this.createUserFromOAuth({
                            email: profile.emails![0].value,
                            username: profile.displayName,
                            providerUserId: profile.id,
                            authProvider: 'google'
                        });
                    }
                    return done(null, user);
                } catch (error) { analyzeError(error as Error);
                    return done(error);
                }
            }));
        }
    }

    private async registerUser(req: express.Request, res: express.Response) {
        try {
            const { email, password, name } = req.body;
            
            // Validate input
            if (!email || !password || !name) {
                console.log('Missing required fields:', req.body);
                return res.status(400).json({ error: 'Missing required fields' });
            }
    
            // Check if user already exists
            const existingUser = await this.findUserByEmail(email);
            if (existingUser) {
                console.log('User already exists:', email);
                return res.status(409).json({ error: 'User already exists' });
            }
            // Hash password
            const hashedPassword = await bcrypt.hash(password, this.SALT_ROUNDS);
            // Create user
            const user: User = {
                id: uuidv4(),
                email,
                username: name,
                password: hashedPassword,
                role: 'user',
                lastLogin: new Date(),
                authProvider: 'local'
            };
            // Store user in Librarian
            this.storeUser(user);
            // Generate token
            const token = this.generateToken(user);
            console.log('User registered successfully:', { ...user, password: undefined });
            res.status(201).json({ token, user: { ...user, password: undefined } });
        } catch (error) { analyzeError(error as Error);
            console.error('New user registration error:', error instanceof Error ? error.message : error);
            res.status(500).json({ error: 'Registration failed' });
        }
    }

    private async handleLogin(req: express.Request, res: express.Response) {
        console.log('Handling login:', req.body);
        passport.authenticate('local', { session: false }, async (err: any, user: User | false, info: { message: string } | undefined) => {
            console.log('Login Authenticate User:', user);
            if (err) {
                console.error('Authentication error:', err);
                return res.status(500).json({ error: 'Internal server error during authentication' });
            }

            if (!user) {
                console.log('Authentication failed (no user):', info);
                return res.status(401).json({ error: info?.message || 'Authentication failed' });
            }

            try {
                // Update last login
                user.lastLogin = new Date();
                this.storeUser(user);

                // Generate token
                const token = this.generateToken(user);
                console.log('Login successful:', { ...user, password: undefined });
                res.status(200).json({ token, user: { ...user, password: undefined } });
            } catch (error) { analyzeError(error as Error);
                console.error('Login error:', error instanceof Error ? error.message : error);
                res.status(500).json({ error: 'Login failed' });
            }
        })(req, res);
    }

    private async handleLogout(req: express.Request, res: express.Response) {
        try {
            // Remove the token check, as it might be invalid
            // Instead, always perform logout actions
    
            // Passport logout function
            if (req.logout) {
                req.logout((err) => {
                    if (err) {
                        console.error('Error logging out with Passport:', err);
                    }
                });
            }
    
            // Clear the token cookie if you're using one
            res.clearCookie('token');
    
            res.status(200).json({ message: 'Logged out successfully' });
        } catch (error) {
            console.error('Logout error:', error instanceof Error ? error.message : error);
            res.status(500).json({ error: 'Logout failed' });
        }
    }

    private async handleCognitoLogin(req: express.Request, res: express.Response) {
        const { username, password } = req.body;
        if (this.cognitoClient) {
            try {
                const command = new InitiateAuthCommand({
                    AuthFlow: "USER_PASSWORD_AUTH",
                    ClientId: process.env.COGNITO_CLIENT_ID,
                    AuthParameters: {
                        USERNAME: username,
                        PASSWORD: password,
                    },
                });

                const response = await this.cognitoClient.send(command);

                if (response.AuthenticationResult) {
                    // Here you might want to create or update a user in your system
                    const user = await this.findOrCreateUserFromCognito(username);

                    // Generate your own token or use the Cognito token
                    const token = this.generateToken(user);

                    res.json({ token, user: { ...user, password: undefined } });
                } else {
                    res.status(401).json({ error: 'Authentication failed' });
                }
            } catch (error) { analyzeError(error as Error);
                console.error('Cognito login error:', error instanceof Error ? error.message : error);
                res.status(500).json({ error: 'Login failed' });
            }
        }else {
            res.status(401).json({ error: 'Authentication failed' });
        }
    }


    // Helper methods
    private generateToken(user: User): string {
        return jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            this.JWT_SECRET,
            { expiresIn: this.JWT_EXPIRES_IN }
        );
    }

    private async findOrCreateUserFromCognito(username: string): Promise<User> {
        // Implement this method to find or create a user based on Cognito username
       // This is just a placeholder implementation
        let user = await this.findUserByEmail(username);
        if (!user) {
            user = {
                id: uuidv4(),
                email: username,
                username: username,
                role: 'user',
                lastLogin: new Date(),
                authProvider: 'cognito'
            };
            await this.storeUser(user);
        }
        return user;
    }

    private async findUserByEmail(email: string): Promise<User | null> {
        try {
            //console.log('Finding user by email:', email, ' from ',this.librarianUrl);
            const response = await axios.post(`http://${this.librarianUrl}/queryData`, {
                collection: 'users',
                query: { email: email },
                limit: 1
            });
    
            if (response.data && response.data.data && response.data.data.length > 0) {
                return response.data.data[0];
            }
            return null;
        } catch (error) { analyzeError(error as Error);
            console.log('Error finding user by email:', email, error instanceof Error ? error.message : '');
            return null;
        }
    }

    private async findUserByProviderId(provider: string, providerId: string): Promise<User | null> {
        try {
            const response = await axios.post(`http://${this.librarianUrl}/queryData`, {
                collection: 'users',
                query: { provider: provider, providerId: providerId },
                limit: 1
            });
        
            if (response.data && response.data.data && response.data.data.length > 0) {
                return response.data.data[0];
            }
            return null;
        } catch (error) { analyzeError(error as Error);
            console.log('Error finding user by provider:', provider, providerId, error instanceof Error ? error.message : '');
            return null;
        }
    }        

    private async storeUser(user: User): Promise<void> {
        return await axios.post(`http://${this.librarianUrl}/storeData`, {
            id: user.email,
            data: user,
            storageType: 'mongo',
            collection: 'users'
        });
    }

    private async verifyToken(req: express.Request, res: express.Response) {
        // Token is already verified by express-jwt middleware
        const user = (req as any).auth;
        if (user && !res.headersSent) {
            res.json({
                valid: true,
                user: {
                    id: user.id,
                    email: user.email,
                    role: user.role
                }
            });
        } else if (!res.headersSent) {
            console.log('Invalid token in verifyToken');
            res.status(401).json({ error: 'Invalid token' });
        }
        // If headers have already been sent, do nothing
    }

    private async createUserFromOAuth(userData: OAuthUserData): Promise<User> {
        try {
            // Generate a unique ID for the new user
            const userId = uuidv4();

            // Create the user object
            const newUser: User = {
                id: userId,
                email: userData.email,
                username: userData.username,
                providerUserId: userData.providerUserId,
                authProvider: userData.authProvider,
                role: 'user', // Default role for OAuth users
                lastLogin: new Date(),
                componentRegistrations: []
            };

            // Store the user in the database
            await this.storeUser(newUser);

            // Log the creation
            console.log(`Created new OAuth user: ${newUser.email} with provider ${userData.authProvider}`);

            // Return the created user
            return newUser;
        } catch (error) { analyzeError(error as Error);
            console.error('Error creating OAuth user:', error instanceof Error ? error.message : error);
            throw new Error('Failed to create user from OAuth data');
        }
    }

    // Additional helper method to verify tokens for middleware use
    public async verifyTokenMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
        try {
            const token = req.headers.authorization?.split(' ')[1];
            
            if (!token) {
                return res.status(401).json({ error: 'Authentication required' });
            }

            const decoded = jwt.verify(token, this.JWT_SECRET) as DecodedToken;
            const user = await this.findUserByEmail(decoded.email);

            if (!user) {
                return res.status(401).json({ error: 'User not found' });
            }

            // Attach user to request
            (req as any).user = {
                id: decoded.id,
                email: decoded.email,
                role: decoded.role
            };

            next();
        } catch (error) { analyzeError(error as Error);
            if (error instanceof jwt.TokenExpiredError) {
                return res.status(401).json({ error: 'Token expired' });
            }
            return res.status(401).json({ error: 'Invalid token' });
        }
    }

    // Role-based authorization middleware
    public authorizeRole(allowedRoles: string[]) {
        return (req: express.Request, res: express.Response, next: express.NextFunction) => {
            const user = (req as any).user;
            
            if (!user) {
                return res.status(401).json({ error: 'Authentication required' });
            }

            if (!allowedRoles.includes(user.role)) {
                return res.status(403).json({ error: 'Insufficient permissions' });
            }

            next();
        };
    }

    // Additional method to refresh tokens
    private async refreshToken(req: express.Request, res: express.Response) {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            return res.status(400).json({ error: 'Refresh token is required' });
        }

        try {
            const decoded = verify(refreshToken, this.JWT_SECRET) as DecodedToken;
            const user = await this.findUserByEmail(decoded.email);

            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            const newAccessToken = sign(
                { id: user.id, email: user.email, role: user.role },
                this.JWT_SECRET,
                { expiresIn: this.JWT_EXPIRES_IN }
            );

            const newRefreshToken = sign(
                { id: user.id },
                this.JWT_SECRET,
                { expiresIn: '7d' }
            );

            res.json({
                token: newAccessToken,
                refreshToken: newRefreshToken
            });
        } catch (error) {
            console.error('Error refreshing token:', error);
            res.status(401).json({ error: 'Invalid refresh token' });
        }
    }

    private generateRefreshToken(user: User): string {
        return jwt.sign(
            { id: user.id, email: user.email },
            this.JWT_SECRET,
            { expiresIn: '7d' } // Refresh tokens typically have a longer lifespan
        );
    }

    private async handleRefreshToken(req: express.Request, res: express.Response) {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            return res.status(400).json({ error: 'Refresh token is required' });
        }
    
        try {
            const decoded = jwt.verify(refreshToken, this.JWT_SECRET) as DecodedToken;
            const user = await this.findUserByEmail(decoded.email);
    
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }
    
            const newAccessToken = this.generateToken(user);
            const newRefreshToken = this.generateRefreshToken(user);
    
            res.json({
                token: newAccessToken,
                refreshToken: newRefreshToken
            });
        } catch (error) {
            console.error('Error refreshing token:', error);
            res.status(401).json({ error: 'Invalid refresh token' });
        }
    }
}

export const securityManager = new SecurityManager();
export default SecurityManager;