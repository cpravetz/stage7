import { User } from '../models/User';

// Extend the User interface to include JWT properties
declare module '../models/User' {
  interface User {
    sub?: string; // Subject (user ID)
    jti?: string; // JWT ID (token ID)
  }
}
