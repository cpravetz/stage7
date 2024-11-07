import jwt from 'jsonwebtoken';
import { analyzeError } from '@cktmcs/errorhandler';

const SECRET_KEY = 'your-very-secret-key'; // Replace with an actual secret key

export interface DecodedToken {
    username: string;
    role: string;
    iat: number;
    exp: number;
}

// Generate a JWT token for a user
export function generateToken(username: string, role: string): string {
    const payload = { username, role };
    return jwt.sign(payload, SECRET_KEY, { expiresIn: '1h' });
}

// Verify a JWT token
export function verifyToken(token: string): DecodedToken | null {
    try {
        const decoded = jwt.verify(token, SECRET_KEY) as DecodedToken;
        return decoded;
    } catch (error) { analyzeError(error as Error);
        console.error('Token verification failed:', error instanceof Error ? error.message : error);
        return null;
    }
}