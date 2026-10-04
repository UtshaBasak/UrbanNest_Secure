import React, { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { sendOtp, verifyOtp } from '../utils/api';
import { Eye, EyeOff, Mail, Lock, User, Phone, AlertCircle, CheckCircle, HelpCircle, X, KeyRound, ShieldCheck } from 'lucide-react';

function getPasswordStrength(pw) {
  if (!pw) return { level: 'none', label: '', color: '', width: '0%' };
  if (pw.length < 12) return { level: 'low', label: 'Weak', color: '#ef4444', width: '33%' };
  if (pw.length <= 14) return { level: 'medium', label: 'Medium', color: '#f59e0b', width: '66%' };
  return { level: 'high', label: 'Strong', color: '#22c55e', width: '100%' };
}

function checkPasswordRules(pw) {
  return {
    minLength: pw.length >= 12,
    hasLower: /[a-z]/.test(pw),
    hasUpper: /[A-Z]/.test(pw),
    hasDigit: /[0-9]/.test(pw),
    hasSpecial: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(pw),
  };
}

function PasswordPolicyPopup({ open, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white dark:bg-neutral-800 rounded-2xl shadow-2xl max-w-md w-full p-6 animate-slide-up" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"><X className="w-5 h-5" /></button>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-cyan-100 dark:bg-cyan-900/40 rounded-full flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-cyan-600" />
          </div>
          <h3 className="text-lg font-bold text-neutral-900 dark:text-white">Password Policy</h3>
        </div>
        <div className="space-y-3 text-sm text-neutral-700 dark:text-neutral-300">
          <div className="p-3 bg-neutral-50 dark:bg-neutral-700/50 rounded-lg"><p className="font-semibold mb-1">🔑 Minimum Length</p><p>At least <strong>12–16 characters</strong>.</p></div>
          <div className="p-3 bg-neutral-50 dark:bg-neutral-700/50 rounded-lg"><p className="font-semibold mb-1">🔠 Complexity</p><p>Uppercase, lowercase, digits, and special characters required.</p></div>
          <div className="p-3 bg-neutral-50 dark:bg-neutral-700/50 rounded-lg"><p className="font-semibold mb-1">🔄 Expiration</p><p>Passwords must be changed every <strong>90 days</strong>.</p></div>
          <div className="p-3 bg-neutral-50 dark:bg-neutral-700/50 rounded-lg"><p className="font-semibold mb-1">🔒 Lockout</p><p>Account locked for 30 minutes after <strong>5 failed attempts</strong>.</p></div>
        </div>
      </div>
    </div>
  );
}

const Register = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({ name: '', email: '', password: '', confirmPassword: '', phone: '', role: 'tenant', profileImage: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [showPolicyPopup, setShowPolicyPopup] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpSending, setOtpSending] = useState(false);

  const strength = useMemo(() => getPasswordStrength(formData.password), [formData.password]);
  const rules = useMemo(() => checkPasswordRules(formData.password), [formData.password]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setFormData(prev => ({ ...prev, profileImage: reader.result }));
    reader.readAsDataURL(file);
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.name.trim()) newErrors.name = 'Name is required';
    if (!formData.email || !/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = 'Valid email is required';
    if (!formData.password || formData.password.length < 12) newErrors.password = 'Password must be at least 12 characters';
    else {
      const r = checkPasswordRules(formData.password);
      if (!r.hasLower || !r.hasUpper || !r.hasDigit || !r.hasSpecial)
        newErrors.password = 'Password must contain uppercase, lowercase, digit, and special character';
    }
    if (formData.password !== formData.confirmPassword) newErrors.confirmPassword = 'Passwords do not match';
    if (!formData.phone) newErrors.phone = 'Phone number is required';
    return newErrors;
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    const newErrors = validateForm();
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
    setOtpSending(true); setErrors({});
    try {
      await sendOtp(formData.email, 'signup');
      setStep(2);
    } catch (error) {
      setErrors({ submit: error.message || 'Failed to send verification code' });
    } finally { setOtpSending(false); }
  };

  const handleOtpSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setErrors({});
    try {
      const result = await verifyOtp(formData.email, otpCode, 'signup');
      const { confirmPassword, ...registerData } = formData;
      await register({ ...registerData, verificationToken: result.verificationToken });
      navigate('/');
    } catch (error) {
      setErrors({ submit: error.message || 'Verification failed' });
    } finally { setLoading(false); }
  };

  const handleResendOtp = async () => {
    setOtpSending(true);
    try { await sendOtp(formData.email, 'signup'); }
    catch (error) { setErrors({ submit: error.message }); }
    finally { setOtpSending(false); }
  };

  if (step === 2) {
    return (
      <div className="min-h-screen flex items-center justify-center py-12 px-4 bg-gradient-to-br from-primary-50 via-white to-secondary-50 dark:from-neutral-900 dark:via-neutral-800 dark:to-neutral-900">
        <div className="w-full max-w-md">
          <div className="card p-8 animate-slide-up">
            <div className="text-center mb-8">
              <div className="mx-auto w-16 h-16 bg-cyan-100 dark:bg-cyan-900/30 rounded-full flex items-center justify-center mb-4"><Mail className="w-8 h-8 text-cyan-600" /></div>
              <h1 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">Verify Your Email</h1>
              <p className="text-neutral-600 dark:text-neutral-400 text-sm">We've sent a 6-digit code to <strong className="text-cyan-600">{formData.email}</strong></p>
            </div>
            {errors.submit && (
              <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-lg flex items-center space-x-3">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" /><span className="text-red-700 dark:text-red-300 text-sm">{errors.submit}</span>
              </div>
            )}
            <form onSubmit={handleOtpSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">Verification Code</label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                  <input type="text" value={otpCode} onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))} maxLength={6} placeholder="000000" autoFocus
                    className="w-full h-14 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 text-center text-3xl tracking-[0.6em] font-mono focus:outline-none focus:ring-2 focus:ring-cyan-600 pl-12" />
                </div>
              </div>
              <button type="submit" disabled={loading || otpCode.length !== 6} className="w-full inline-flex items-center justify-center rounded-md bg-cyan-600 hover:bg-cyan-700 text-white py-3 font-medium disabled:opacity-50">
                {loading ? 'Creating Account...' : 'Verify & Create Account'}
              </button>
            </form>
            <div className="mt-6 flex items-center justify-between">
              <button onClick={() => setStep(1)} className="text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300">← Back</button>
              <button onClick={handleResendOtp} disabled={otpSending} className="text-sm text-cyan-600 hover:text-cyan-700 disabled:opacity-50">{otpSending ? 'Sending...' : 'Resend Code'}</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 bg-gradient-to-br from-primary-50 via-white to-secondary-50 dark:from-neutral-900 dark:via-neutral-800 dark:to-neutral-900">
      <PasswordPolicyPopup open={showPolicyPopup} onClose={() => setShowPolicyPopup(false)} />
      <div className="w-full max-w-md">
        <div className="card p-8 animate-slide-up">
          <div className="text-center mb-8"><h1 className="text-3xl font-bold gradient-text mb-2">Create Your Account</h1></div>
          {errors.submit && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-lg flex items-center space-x-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" /><span className="text-red-700 dark:text-red-300 text-sm">{errors.submit}</span>
            </div>
          )}
          <form onSubmit={handleFormSubmit} className="space-y-5" autoComplete="off" noValidate>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">Full Name</label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                <input type="text" name="name" value={formData.name} onChange={handleChange}
                  className={`w-full h-11 rounded border ${errors.name ? 'border-red-500' : 'border-neutral-300 dark:border-neutral-700'} bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-cyan-600 pl-12 pr-4`}
                  placeholder="Enter your full name" />
              </div>
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">Email Address</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                <input type="email" name="email" value={formData.email} onChange={handleChange}
                  className={`w-full h-11 rounded border ${errors.email ? 'border-red-500' : 'border-neutral-300 dark:border-neutral-700'} bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-cyan-600 pl-12 pr-4`}
                  placeholder="Enter your email address" />
              </div>
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">Profile Picture (optional)</label>
              <div className="flex items-center gap-4">
                {formData.profileImage ? <img src={formData.profileImage} alt="Preview" className="h-12 w-12 rounded-full object-cover border" /> : <div className="h-12 w-12 rounded-full bg-neutral-200 dark:bg-neutral-700" />}
                <input type="file" accept="image/*" onChange={handleImageChange} className="block w-full text-sm text-neutral-900 dark:text-neutral-200 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-cyan-50 file:text-cyan-700 hover:file:bg-cyan-100" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">Phone Number</label>
              <div className="relative">
                <Phone className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                <input type="tel" name="phone" value={formData.phone} onChange={handleChange}
                  className={`w-full h-11 rounded border ${errors.phone ? 'border-red-500' : 'border-neutral-300 dark:border-neutral-700'} bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-cyan-600 pl-12 pr-4`}
                  placeholder="Enter your phone number" />
              </div>
              {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">Registering as</label>
              <select name="role" value={formData.role} onChange={handleChange} className="w-full h-11 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-cyan-600 px-3">
                <option value="tenant">Tenant</option>
                <option value="owner">Owner</option>
              </select>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Password</label>
                <span className="text-xs text-neutral-500">Password Rules</span>
                <button type="button" onClick={() => setShowPolicyPopup(true)} className="text-neutral-400 hover:text-cyan-600"><HelpCircle className="w-4 h-4" /></button>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                <input type={showPassword ? 'text' : 'password'} name="password" value={formData.password} onChange={handleChange} autoComplete="new-password"
                  className={`w-full h-11 rounded border ${errors.password ? 'border-red-500' : 'border-neutral-300 dark:border-neutral-700'} bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-cyan-600 pl-12 pr-12`}
                  placeholder="Min. 12 characters" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400">
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {formData.password && (
                <div className="mt-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-neutral-500">Strength</span>
                    <span className="text-xs font-semibold" style={{ color: strength.color }}>{strength.label}</span>
                  </div>
                  <div className="w-full h-2 bg-neutral-200 dark:bg-neutral-600 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: strength.width, backgroundColor: strength.color }} />
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-1">
                    {[{ ok: rules.minLength, label: '12+ characters' }, { ok: rules.hasUpper, label: 'Uppercase' }, { ok: rules.hasLower, label: 'Lowercase' }, { ok: rules.hasDigit, label: 'Number' }, { ok: rules.hasSpecial, label: 'Special char' }].map(r => (
                      <div key={r.label} className="flex items-center gap-1">
                        <div className={`w-3 h-3 rounded-full ${r.ok ? 'bg-green-500' : 'bg-neutral-300 dark:bg-neutral-600'}`} />
                        <span className={`text-xs ${r.ok ? 'text-green-600 dark:text-green-400' : 'text-neutral-400'}`}>{r.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">Confirm Password</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                <input type={showConfirmPassword ? 'text' : 'password'} name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} autoComplete="new-password"
                  className={`w-full h-11 rounded border ${errors.confirmPassword ? 'border-red-500' : 'border-neutral-300 dark:border-neutral-700'} bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-cyan-600 pl-12 pr-12`}
                  placeholder="Confirm your password" />
                <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400">
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {formData.confirmPassword && formData.password === formData.confirmPassword && (
                <div className="flex items-center space-x-2 mt-2"><CheckCircle className="w-4 h-4 text-green-600" /><span className="text-green-600 text-sm">Passwords match</span></div>
              )}
              {errors.confirmPassword && <p className="text-red-500 text-xs mt-1">{errors.confirmPassword}</p>}
            </div>
            <button type="submit" disabled={otpSending} className="w-full inline-flex items-center justify-center rounded-md bg-cyan-600 hover:bg-cyan-700 text-white py-3 font-medium disabled:opacity-50">
              {otpSending ? 'Sending Verification...' : 'Continue — Verify Email'}
            </button>
          </form>
          <div className="mt-6 text-center">
            <p className="text-neutral-600 dark:text-neutral-400 text-sm">Already have an account?{' '}
              <Link to="/login" className="font-medium text-primary-600 dark:text-primary-400 hover:text-primary-500 transition-colors">Sign in here</Link>
            </p>
            <Link to="/forgot-password" className="block mt-2 text-xs text-cyan-600 dark:text-cyan-400 hover:text-cyan-500 transition-colors">Forgot Password?</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;
