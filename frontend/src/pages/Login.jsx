import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff, Mail, Lock, AlertCircle, Shield, KeyRound } from 'lucide-react';

const Login = () => {
  const { login, complete2FA } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [show2FA, setShow2FA] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const fromLocation = location.state?.from;
  const from = fromLocation?.pathname && fromLocation.pathname !== '/login'
    ? `${fromLocation.pathname}${fromLocation.search || ''}`
    : '/dashboard';

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const result = await login(formData.email, formData.password);
      if (result?.requires2FA) { setShow2FA(true); setLoading(false); return; }
      navigate(from, { replace: true });
    } catch (error) {
      setError(error.message || 'Login failed. Please try again.');
    } finally { setLoading(false); }
  };

  const handle2FASubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await complete2FA(otpCode);
      navigate(from, { replace: true });
    } catch (error) {
      setError(error.message || 'Verification failed.');
    } finally { setLoading(false); }
  };

  if (show2FA) {
    return (
      <div className="min-h-screen flex items-center justify-center py-12 px-4 bg-linear-to-br from-primary-50 via-white to-secondary-50 dark:from-neutral-900 dark:via-neutral-800 dark:to-neutral-900">
        <div className="w-full max-w-md">
          <div className="card p-8 animate-slide-up">
            <div className="text-center mb-8">
              <div className="mx-auto w-16 h-16 bg-cyan-100 dark:bg-cyan-900/30 rounded-full flex items-center justify-center mb-4"><Shield className="w-8 h-8 text-cyan-600" /></div>
              <h1 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">Two-Factor Authentication</h1>
              <p className="text-neutral-600 dark:text-neutral-400 text-sm">A verification code has been sent to your email.</p>
            </div>
            {error && (
              <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-lg flex items-center space-x-3">
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0" /><span className="text-red-700 dark:text-red-300 text-sm">{error}</span>
              </div>
            )}
            <form onSubmit={handle2FASubmit} className="space-y-6">
              <div>
                <label htmlFor="login-otp" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">Verification Code</label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                  <input type="text" id="login-otp" value={otpCode} onChange={(e) => { setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6)); if (error) setError(''); }} maxLength={6} placeholder="000000" autoFocus
                    className="w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 px-4 py-3 pl-11 text-center text-2xl tracking-[0.5em] font-mono focus:outline-hidden focus:ring-2 focus:ring-cyan-500" />
                </div>
              </div>
              <button type="submit" disabled={loading || otpCode.length !== 6} className="w-full btn btn-primary py-3 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed">
                {loading ? 'Verifying...' : 'Verify & Sign In'}
              </button>
            </form>
            <div className="mt-6 text-center">
              <button onClick={() => { setShow2FA(false); setOtpCode(''); setError(''); }} className="text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300">← Back to login</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 bg-linear-to-br from-primary-50 via-white to-secondary-50 dark:from-neutral-900 dark:via-neutral-800 dark:to-neutral-900">
      <div className="w-full max-w-md">
        <div className="card p-8 animate-slide-up">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold gradient-text mb-2">Welcome Back!</h1>
            <p className="text-neutral-600 dark:text-neutral-400">Sign in to access your account</p>
          </div>
          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-lg flex items-center space-x-3 animate-slide-up">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0" /><span className="text-red-700 dark:text-red-300 text-sm">{error}</span>
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-6" autoComplete="off" noValidate>
            <div>
              <label htmlFor="login-email" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">Email Address</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                <input type="email" id="login-email" name="email" value={formData.email} onChange={handleChange} required autoComplete="off"
                  className="w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 px-4 py-3 pl-11 focus:outline-hidden focus:ring-2 focus:ring-primary-500"
                  placeholder="Enter your email address" />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="login-password" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Password</label>
                <Link to="/forgot-password" className="text-xs font-medium text-cyan-600 dark:text-cyan-400 hover:text-cyan-500 transition-colors">Forgot Password?</Link>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                <input type={showPassword ? 'text' : 'password'} id="login-password" name="password" value={formData.password} onChange={handleChange} required autoComplete="new-password"
                  className="w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 px-4 py-3 pl-11 pr-11 focus:outline-hidden focus:ring-2 focus:ring-primary-500"
                  placeholder="Enter your password" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300">
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading} className="w-full btn btn-primary py-3 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? 'Signing In...' : 'Sign In'}
            </button>
          </form>
          <div className="mt-8 text-center">
            <p className="text-neutral-600 dark:text-neutral-400">Don't have an account?{' '}
              <Link to="/register" className="font-medium text-primary-600 dark:text-primary-400 hover:text-primary-500 transition-colors">Sign up here</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
