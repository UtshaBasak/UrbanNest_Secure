import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiChangePassword } from '../utils/api';
import { Lock, Eye, EyeOff, AlertCircle, CheckCircle, ShieldAlert } from 'lucide-react';

function getPasswordStrength(pw) {
  if (!pw) return { label: '', color: '', width: '0%' };
  if (pw.length < 12) return { label: 'Weak', color: '#ef4444', width: '33%' };
  if (pw.length <= 14) return { label: 'Medium', color: '#f59e0b', width: '66%' };
  return { label: 'Strong', color: '#22c55e', width: '100%' };
}

const ForceChangePassword = () => {
  const navigate = useNavigate();
  const { clearPasswordExpired, logout } = useAuth();
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const strength = useMemo(() => getPasswordStrength(newPw), [newPw]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (newPw.length < 12) { setError('Password must be at least 12 characters'); return; }
    if (!/[a-z]/.test(newPw) || !/[A-Z]/.test(newPw) || !/[0-9]/.test(newPw) || !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(newPw)) {
      setError('Password must meet all complexity requirements'); return;
    }
    if (newPw !== confirmPw) { setError('Passwords do not match'); return; }
    setLoading(true); setError('');
    try {
      await apiChangePassword(currentPw, newPw);
      clearPasswordExpired();
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 bg-linear-to-br from-primary-50 via-white to-secondary-50 dark:from-neutral-900 dark:via-neutral-800 dark:to-neutral-900">
      <div className="w-full max-w-md">
        <div className="card p-8 animate-slide-up">
          <div className="text-center mb-8">
            <div className="mx-auto w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mb-4"><ShieldAlert className="w-8 h-8 text-amber-600" /></div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">Password Expired</h1>
            <p className="text-neutral-600 dark:text-neutral-400 text-sm">Your password must be changed every 90 days. Please set a new password.</p>
          </div>
          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-lg flex items-center space-x-3">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0" /><span className="text-red-700 dark:text-red-300 text-sm">{error}</span>
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">Current Password</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                <input type="password" value={currentPw} onChange={(e) => { setCurrentPw(e.target.value); setError(''); }}
                  className="w-full h-11 rounded-sm border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-hidden focus:ring-2 focus:ring-cyan-600 pl-12"
                  placeholder="Enter current password" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">New Password</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                <input type={showPw ? 'text' : 'password'} value={newPw} onChange={(e) => setNewPw(e.target.value)}
                  className="w-full h-11 rounded-sm border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-hidden focus:ring-2 focus:ring-cyan-600 pl-12 pr-12"
                  placeholder="Min. 12 characters" />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400">
                  {showPw ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {newPw && (
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
                <input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)}
                  className="w-full h-11 rounded-sm border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-hidden focus:ring-2 focus:ring-cyan-600 pl-12"
                  placeholder="Confirm new password" />
              </div>
              {confirmPw && newPw === confirmPw && (
                <div className="flex items-center gap-1 mt-1"><CheckCircle className="w-4 h-4 text-green-500" /><span className="text-xs text-green-600">Passwords match</span></div>
              )}
            </div>
            <button type="submit" disabled={loading} className="w-full inline-flex items-center justify-center rounded-md bg-cyan-600 hover:bg-cyan-700 text-white py-3 font-medium disabled:opacity-50">
              {loading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
          <div className="mt-6 text-center">
            <button onClick={logout} className="text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300">Sign out instead</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForceChangePassword;
