import jwt from 'jsonwebtoken';
import { analyzeError } from '@cktmcs/errorhandler';
import {v4 as uuidv4} from 'uuid';
import fs from 'fs';
import path from 'path';

// Try to load the RSA keys for JWT signing and verification
let PRIVATE_KEY: string;
let PUBLIC_KEY: string;
let isUsingAsymmetricKeys = false;

try {
    PRIVATE_KEY = fs.readFileSync(path.join(__dirname, '../../keys/private.pem'), 'utf8');
    PUBLIC_KEY = fs.readFileSync(path.join(__dirname, '../../keys/public.pem'), 'utf8');
    isUsingAsymmetricKeys = true;
    console.log('Loaded RSA keys for JWT signing and verification in tokenUtils');
} catch (error) {
    console.error('Failed to load RSA keys for tokenUtils:', error);
    console.warn('Using fallback secret key for JWT signing and verification in tokenUtils');
    PRIVATE_KEY = process.env.JWT_SECRET || uuidv4();
    PUBLIC_KEY = PRIVATE_KEY;
}

export interface DecodedToken {
    username: string;
    role: string;
    iat: number;
    exp: number;
}

// Generate a JWT token for a user
export function generateToken(username: string, role: string): string {
    const payload = { username, role };

    if (isUsingAsymmetricKeys) {
        return jwt.sign(payload, PRIVATE_KEY, {
            algorithm: 'RS256',
            expiresIn: '365d'
        });
    } else {
        return jwt.sign(payload, PRIVATE_KEY, {
            expiresIn: '365d'
        });
    }
}

// Verify a JWT token
export function verifyToken(token: string): DecodedToken | null {
    try {
        if (isUsingAsymmetricKeys) {
            try {
                // First try to verify with RS256
                const decoded = jwt.verify(token, PUBLIC_KEY, { algorithms: ['RS256'] }) as DecodedToken;
                return decoded;
            } catch (rsaError) {
                // If that fails, try with the legacy HS256 method
                console.log('RS256 verification failed, trying legacy HS256 verification');
                const legacySecret = process.env.JWT_SECRET || 'your-secret-key';
                const decoded = jwt.verify(token, legacySecret) as DecodedToken;
                return decoded;
            }
        } else {
            const decoded = jwt.verify(token, PUBLIC_KEY) as DecodedToken;
            return decoded;
        }
    } catch (error) { analyzeError(error as Error);
        console.error('Token verification failed:', error instanceof Error ? error.message : error);
        return null;
    }
}