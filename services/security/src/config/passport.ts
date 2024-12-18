import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import { Strategy as LocalStrategy } from 'passport-local';
import { PassportStatic } from 'passport';
import bcrypt from 'bcrypt';
import { findUserByEmail, findUserById } from '../services/userService';
import {v4 as uuidv4} from 'uuid';

const SECRET_KEY = process.env.JWT_SECRET || uuidv4();

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
        secretOrKey: SECRET_KEY
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