import React, { useState } from 'react';
import './Login.css';

interface LoginProps {
    onLogin: (email: string, password: string) => Promise<void>;
    onRegister: (name: string, email: string, password: string) => Promise<void>;
}

const LoginComponent: React.FC<LoginProps> = ({ onLogin, onRegister }) => {
    const [isLogin, setIsLogin] = useState(true);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        try {
            if (isLogin) {
                await onLogin(email, password);
            } else {
                await onRegister(name, email, password);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        }
    };

    return (
        <div className="auth-container">
            <form onSubmit={handleSubmit}>
                <h2>{isLogin ? 'Login' : 'Register'}</h2>
                {error && <div className="error-message">{error}</div>}
                {!isLogin && (
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Name"
                        required
                    />
                )}
                <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email"
                    required
                />
                <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    required
                />
                <button type="submit">{isLogin ? 'Login' : 'Register'}</button>
            </form>
            <p>
                {isLogin ? "Don't have an account? " : "Already have an account? "}
                <button className="toggle-auth" onClick={() => setIsLogin(!isLogin)}>
                    {isLogin ? 'Register' : 'Login'}
                </button>
            </p>
        </div>
    );
};

export default LoginComponent;