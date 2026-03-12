import React, { useState } from 'react';
import { API } from '../services/api';
import './Auth.css';

export default function Auth({ onLogin }) {
    const [isLogin, setIsLogin] = useState(true);
    const [form, setForm] = useState({ username: '', password: '' });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleAuth = async () => {
        // Validation
        if (!form.username.trim() || !form.password.trim()) {
            setError('Username and password are required');
            return;
        }

        if (!isLogin && form.username.length < 3) {
            setError('Username must be at least 3 characters');
            return;
        }

        if (!isLogin && form.password.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const endpoint = isLogin ? '/login' : '/signup';
            const { data } = await API.post(endpoint, form);
            if (isLogin) {
                onLogin(data.token, data.username);
            } else {
                setForm({ username: '', password: '' });
                setError('');
                setIsLogin(true);
                alert("Account created successfully! Please login.");
            }
        } catch (e) {
            const errorMessage = e.response?.data?.error || e.message || 'An error occurred';
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setForm({ ...form, [name]: value });
        setError('');
    };

    return (
        <div className="app-container">
            <div className="auth-card">
                <h2>{isLogin ? 'Login' : 'Create Account'}</h2>
                
                <label htmlFor="username" className="form-label">Username</label>
                <input
                    id="username"
                    type="text"
                    name="username"
                    placeholder="Enter your username"
                    value={form.username}
                    onChange={handleInputChange}
                    disabled={loading}
                    aria-label="Username"
                    aria-invalid={error ? 'true' : 'false'}
                />
                
                <label htmlFor="password" className="form-label">Password</label>
                <input
                    id="password"
                    type="password"
                    name="password"
                    placeholder="Enter your password"
                    value={form.password}
                    onChange={handleInputChange}
                    disabled={loading}
                    aria-label="Password"
                    aria-invalid={error ? 'true' : 'false'}
                />
                
                {error && (
                    <p className="error-message" role="alert">
                        {error}
                    </p>
                )}
                
                <button 
                    onClick={handleAuth} 
                    disabled={loading}
                    aria-busy={loading}
                >
                    {loading ? 'Loading...' : isLogin ? 'Login' : 'Signup'}
                </button>
                
                <p 
                    onClick={() => {
                        setIsLogin(!isLogin);
                        setError('');
                        setForm({ username: '', password: '' });
                    }} 
                    style={{ cursor: 'pointer' }}
                    role="button"
                    tabIndex={0}
                    onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                            setIsLogin(!isLogin);
                            setError('');
                            setForm({ username: '', password: '' });
                        }
                    }}
                >
                    {isLogin ? "Don't have an account? Create one" : "Already have an account? Login instead"}
                </p>
            </div>
        </div>
    );
}
