import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import { Strategy as LocalStrategy } from 'passport-local';
import { PassportStatic } from 'passport';
import bcrypt from 'bcrypt';
import fs from 'fs';
import path from 'path';
import { findUserByEmail, findUserById } from '../services/userService';
import {v4 as uuidv4} from 'uuid';

// Try to load the public key for RS256 verification
let PUBLIC_KEY: string;
try {
    PUBLIC_KEY = fs.readFileSync(path.join(__dirname, '../../keys/public.pem'), 'utf8');
    console.log('Loaded RSA public key for JWT verification in passport');
} catch (error) {
    console.error('Failed to load RSA public key for passport:', error);
    console.warn('Using fallback secret key for JWT verification in passport');
    PUBLIC_KEY = process.env.JWT_SECRET || uuidv4();
}

export const configurePassport = (passport: PassportStatic) => {
    passport.use(new LocalStrategy(
        { usernameField: 'email' },
        async (email, password, done) => {
            try {
                console.log('Authenticating user:', email);
                const user = await findUserByEmail(email);
                if (!user) {
                    return done(null, false, { message: 'User not found' });
                }
                const isMatch = user.password && await bcrypt.compare(password, user.password);
                if (!isMatch) {
                    return done(null, false, { message: 'Incorrect password' });
                }
                return done(null, user);
            } catch (error) {
                return done(error);
            }
        }
    ));

    passport.use(new JwtStrategy({
        jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
        secretOrKey: PUBLIC_KEY,
        algorithms: ['RS256']
    }, async (jwtPayload, done) => {
        try {
            const user = await findUserById(jwtPayload.id);
            if (user) {
                return done(null, user);
            } else {
                return done(null, false);
            }
        } catch (error) {
            return done(error, false);
        }
    }));
};