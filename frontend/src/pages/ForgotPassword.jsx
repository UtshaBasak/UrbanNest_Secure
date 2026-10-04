import React, { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { forgotPassword, resetPassword } from '../utils/api';
import { Mail, Lock, AlertCircle, CheckCircle, KeyRound, Eye, EyeOff, ArrowLeft } from 'lucide-react';

function getPasswordStrength(pw) {
  if (!pw) return { label: '', color: '', width: '0%' };
  if (pw.length < 12) return { label: 'Weak', color: '#ef4444', width: '33%' };
  if (pw.length <= 14) return { label: 'Medium', color: '#f59e0b', width: '66%' };
  return { label: 'Strong', color: '#22c55e', width: '100%' };
}

const ForgotPassword = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const strength = useMemo(() => getPasswordStrength(newPassword), [newPassword]);

  const handleSendOtp = async (e) => {
    e.preventDefault();
    if (!email) { setError('Email is required'); return; }
    setLoading(true); setError('');
    try {
      await forgotPassword(email);
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally { setLoading(false); }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    if (!otp || otp.length !== 6) { setError('Enter the 6-digit code'); return; }
    if (newPassword.length < 12) { setError('Password must be at least 12 characters'); return; }
    if (!/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(newPassword)) {
      setError('Password must contain uppercase, lowercase, digit, and special character'); return;
    }
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return; }
    setLoading(true); setError('');
    try {
      await resetPassword(email, otp, newPassword);
      setStep(3);
    } catch (err) {
      setError(err.message);
    } finally { setLoading(false); }
  };

  if (step === 3) {
    return (
      <div className="min-h-screen flex items-center justify-center py-12 px-4 bg-gradient-to-br from-primary-50 via-white to-secondary-50 dark:from-neutral-900 dark:via-neutral-800 dark:to-neutral-900">
        <div className="w-full max-w-md">
          <div className="card p-8 animate-slide-up text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4"><CheckCircle className="w-8 h-8 text-green-600" /></div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">Password Reset!</h1>
            <p className="text-neutral-600 dark:text-neutral-400 mb-6">Your password has been changed successfully.</p>
            <Link to="/login" className="inline-flex items-center justify-center rounded-md bg-cyan-600 hover:bg-cyan-700 text-white py-3 px-6 font-medium">Sign In</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 bg-gradient-to-br from-primary-50 via-white to-secondary-50 dark:from-neutral-900 dark:via-neutral-800 dark:to-neutral-900">
      <div className="w-full max-w-md">
        <div className="card p-8 animate-slide-up">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">{step === 1 ? 'Forgot Password?' : 'Reset Your Password'}</h1>
            <p className="text-neutral-600 dark:text-neutral-400 text-sm">{step === 1 ? "Enter your email and we'll send a verification code." : `Enter the code sent to ${email} and your new password.`}</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-lg flex items-center space-x-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" /><span className="text-red-700 dark:text-red-300 text-sm">{error}</span>
            </div>
          )}

          {step === 1 ? (
            <form onSubmit={handleSendOtp} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">Email Address</label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                  <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(''); }} autoFocus
                    className="w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 px-4 py-3 pl-11 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    placeholder="Enter your email" />
                </div>
              </div>
              <button type="submit" disabled={loading} className="w-full inline-flex items-center justify-center rounded-md bg-cyan-600 hover:bg-cyan-700 text-white py-3 font-medium disabled:opacity-50">
                {loading ? 'Sending...' : 'Send Verification Code'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleReset} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">Verification Code</label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                  <input type="text" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} maxLength={6} autoFocus
                    className="w-full h-14 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 text-center text-3xl tracking-[0.6em] font-mono focus:outline-none focus:ring-2 focus:ring-cyan-600 pl-12"
                    placeholder="000000" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">New Password</label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                  <input type={showPw ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full h-11 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-cyan-600 pl-12 pr-12"
                    placeholder="Min. 12 characters" />
                  <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400">
                    {showPw ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {newPassword && (
                  <div className="mt-2">
                    <div className="flex justify-between mb-1"><span className="text-xs text-neutral-500">Strength</span><span className="text-xs font-semibold" style={{ color: strength.color }}>{strength.label}</span></div>
                    <div className="w-full h-2 bg-neutral-200 dark:bg-neutral-600 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: strength.width, backgroundColor: strength.color }} />
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">Confirm New Password</label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                  <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full h-11 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-cyan-600 pl-12"
                    placeholder="Confirm password" />
                </div>
                {confirmPassword && newPassword === confirmPassword && (
                  <div className="flex items-center gap-1 mt-1"><CheckCircle className="w-4 h-4 text-green-500" /><span className="text-xs text-green-600">Passwords match</span></div>
                )}
              </div>
              <button type="submit" disabled={loading} className="w-full inline-flex items-center justify-center rounded-md bg-cyan-600 hover:bg-cyan-700 text-white py-3 font-medium disabled:opacity-50">
                {loading ? 'Resetting...' : 'Reset Password'}
              </button>
              <button type="button" onClick={handleSendOtp} disabled={loading} className="w-full text-center text-sm text-cyan-600 hover:text-cyan-700">Resend Code</button>
            </form>
          )}

          <div className="mt-6 text-center">
            <Link to="/login" className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300">
              <ArrowLeft className="w-4 h-4" /> Back to Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
