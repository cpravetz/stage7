import React, { useState } from 'react';
import { Box, Paper, Typography, TextField, Button, Link, Alert, Container, Avatar, useTheme } from '@mui/material/index.js';
import { LockOutlined as LockOutlinedIcon, PersonAdd as PersonAddIcon  } from '@mui/icons-material';
import { motion } from 'framer-motion';

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

    const theme = useTheme();

    // Animation variants
    const containerVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: {
            opacity: 1,
            y: 0,
            transition: {
                duration: 0.5,
                when: "beforeChildren",
                staggerChildren: 0.1
            }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 10 },
        visible: { opacity: 1, y: 0 }
    };

    return (
        <Container maxWidth="sm" sx={{
            height: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        }}>
            <motion.div
                initial="hidden"
                animate="visible"
                variants={containerVariants}
                style={{ width: '100%' }}
            >
                <Paper
                    elevation={3}
                    sx={{
                        p: 4,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        borderRadius: 3,
                        background: theme.palette.mode === 'dark'
                            ? 'linear-gradient(145deg, rgba(66,66,66,1) 0%, rgba(33,33,33,1) 100%)'
                            : 'linear-gradient(145deg, rgba(255,255,255,1) 0%, rgba(245,245,245,1) 100%)'
                    }}
                >
                    <motion.div variants={itemVariants}>
                        <Avatar sx={{
                            m: 1,
                            bgcolor: isLogin ? 'primary.main' : 'secondary.main',
                            width: 56,
                            height: 56
                        }}>
                            {isLogin ? <LockOutlinedIcon /> : <PersonAddIcon />}
                        </Avatar>
                    </motion.div>

                    <motion.div variants={itemVariants}>
                        <Typography component="h1" variant="h4" sx={{ mb: 3, fontWeight: 'bold' }}>
                            {isLogin ? 'Sign In' : 'Create Account'}
                        </Typography>
                    </motion.div>

                    {error && (
                        <motion.div variants={itemVariants} style={{ width: '100%', marginBottom: 16 }}>
                            <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
                        </motion.div>
                    )}

                    <Box component="form" onSubmit={handleSubmit} sx={{ width: '100%' }}>
                        {!isLogin && (
                            <motion.div variants={itemVariants}>
                                <TextField
                                    margin="normal"
                                    required
                                    fullWidth
                                    id="name"
                                    label="Full Name"
                                    name="name"
                                    autoComplete="name"
                                    autoFocus={!isLogin}
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    sx={{ mb: 2 }}
                                />
                            </motion.div>
                        )}

                        <motion.div variants={itemVariants}>
                            <TextField
                                margin="normal"
                                required
                                fullWidth
                                id="email"
                                label="Email Address"
                                name="email"
                                autoComplete="email"
                                autoFocus={isLogin}
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                sx={{ mb: 2 }}
                            />
                        </motion.div>

                        <motion.div variants={itemVariants}>
                            <TextField
                                margin="normal"
                                required
                                fullWidth
                                name="password"
                                label="Password"
                                type="password"
                                id="password"
                                autoComplete={isLogin ? 'current-password' : 'new-password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                sx={{ mb: 3 }}
                            />
                        </motion.div>

                        <motion.div variants={itemVariants}>
                            <Button
                                type="submit"
                                fullWidth
                                variant="contained"
                                color={isLogin ? 'primary' : 'secondary'}
                                size="large"
                                sx={{
                                    py: 1.5,
                                    mb: 3,
                                    borderRadius: 2,
                                    fontWeight: 'bold'
                                }}
                            >
                                {isLogin ? 'Sign In' : 'Create Account'}
                            </Button>
                        </motion.div>

                        <motion.div variants={itemVariants}>
                            <Box sx={{ textAlign: 'center' }}>
                                <Link
                                    component="button"
                                    variant="body2"
                                    onClick={() => setIsLogin(!isLogin)}
                                    underline="hover"
                                    sx={{ cursor: 'pointer' }}
                                >
                                    {isLogin ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
                                </Link>
                            </Box>
                        </motion.div>
                    </Box>
                </Paper>

                <motion.div variants={itemVariants}>
                    <Typography variant="body2" color="text.secondary" align="center" sx={{ mt: 4 }}>
                        Stage7 - Collaborative AI System
                    </Typography>
                </motion.div>
            </motion.div>
        </Container>
    );
};

export default LoginComponent;