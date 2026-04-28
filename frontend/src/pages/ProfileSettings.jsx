import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getPropertiesByOwner, deleteCurrentUser, apiChangeEmail, apiConfirmEmailChange, apiToggle2FA } from '../utils/api';
import { Save, Building2, Edit, Eye, Mail, Shield, Lock, AlertCircle, CheckCircle, KeyRound, X } from 'lucide-react';

const ProfileSettings = () => {
  const { user, loading, updateProfile: updateAuthProfile, logout, checkAuthStatus } = useAuth();
  const navigate = useNavigate();
  const [editForm, setEditForm] = useState({ name: '', phone: '', profileImage: '', role: '' });
  const [saving, setSaving] = useState(false);
  const [ownerProps, setOwnerProps] = useState([]);
  const isOwner = (editForm.role || user?.role) === 'owner';

  // ─── Change Email State ──────────────────────────────────────────────────
  const [emailModal, setEmailModal] = useState(null);
  const [emailPassword, setEmailPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [emailOtp, setEmailOtp] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [emailSuccess, setEmailSuccess] = useState('');

  // ─── 2FA State ────────────────────────────────────────────────────────────
  const [tfaModal, setTfaModal] = useState(false);
  const [tfaPassword, setTfaPassword] = useState('');
  const [tfaLoading, setTfaLoading] = useState(false);
  const [tfaError, setTfaError] = useState('');

  useEffect(() => {
    if (user) {
      setEditForm({ name: user.name || '', phone: user.phone || '', profileImage: user.profileImage || '', role: user.role || 'tenant' });
    }
  }, [user]);

  useEffect(() => {
    if (editForm.role === 'owner' && user) {
      getPropertiesByOwner(user._id || user.id).then(res => setOwnerProps(res.data.properties || [])).catch(() => setOwnerProps([]));
    } else {
      setOwnerProps([]);
    }
  }, [editForm.role, user]);

  const handleImageFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setEditForm(prev => ({ ...prev, profileImage: reader.result }));
    reader.readAsDataURL(file);
  };

  const onSave = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      const formData = { ...editForm };
      if (user?.role === 'admin') formData.role = 'admin';
      await updateAuthProfile(formData);
    } catch (e) {
      alert('Failed to save profile');
    } finally { setSaving(false); }
  };

  // ─── Change Email handlers ───────────────────────────────────────────────
  const handleEmailSendOtp = async () => {
    if (!newEmail || !/^\S+@\S+\.\S+$/.test(newEmail)) { setEmailError('Enter a valid email'); return; }
    setEmailLoading(true); setEmailError('');
    try {
      await apiChangeEmail(emailPassword, newEmail);
      setEmailModal('otp');
    } catch (err) { setEmailError(err.message); }
    finally { setEmailLoading(false); }
  };

  const handleEmailVerifyOtp = async () => {
    setEmailLoading(true); setEmailError('');
    try {
      await apiConfirmEmailChange(newEmail, emailOtp);
      setEmailSuccess('Email updated successfully!');
      setEmailModal(null);
      setEmailPassword(''); setNewEmail(''); setEmailOtp('');
      await checkAuthStatus();
      setTimeout(() => setEmailSuccess(''), 3000);
    } catch (err) { setEmailError(err.message); }
    finally { setEmailLoading(false); }
  };

  const closeEmailModal = () => { setEmailModal(null); setEmailPassword(''); setNewEmail(''); setEmailOtp(''); setEmailError(''); };

  // ─── 2FA handlers ────────────────────────────────────────────────────────
  const handleToggle2FA = async () => {
    setTfaLoading(true); setTfaError('');
    try {
      await apiToggle2FA(tfaPassword, !user?.twoFactorEnabled);
      setTfaModal(false); setTfaPassword('');
      await checkAuthStatus();
    } catch (err) { setTfaError(err.message); }
    finally { setTfaLoading(false); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-lg">Loading...</div>;
  if (!user) return <div className="min-h-screen flex items-center justify-center text-lg text-red-600">You must be logged in.</div>;

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-white mb-6">Edit Profile</h1>

        {emailSuccess && (
          <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 rounded-lg flex items-center space-x-3">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
            <span className="text-green-700 dark:text-green-300 text-sm">{emailSuccess}</span>
          </div>
        )}

        {/* Profile form */}
        <div className="bg-white dark:bg-neutral-800 rounded-lg shadow-md p-6 mb-6">
          <form onSubmit={onSave} className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-1 flex items-center justify-center">
              <div className="w-28 h-28 rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden flex items-center justify-center">
                {editForm.profileImage ? <img src={editForm.profileImage} alt="avatar" className="w-full h-full object-cover" /> : <span className="text-neutral-600 dark:text-neutral-300 text-sm">No Photo</span>}
              </div>
            </div>
            <div className="md:col-span-2 space-y-4">
              <div>
                <label className="block text-sm mb-2 text-neutral-700 dark:text-neutral-300">Name</label>
                <input value={editForm.name} onChange={(e) => setEditForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white" required />
              </div>
              <div>
                <label className="block text-sm mb-2 text-neutral-700 dark:text-neutral-300">Role</label>
                {user?.role === 'admin' ? (
                  <div className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg bg-gray-100 dark:bg-neutral-600 text-neutral-700 dark:text-neutral-300">Admin</div>
                ) : (
                  <select value={editForm.role} onChange={e => setEditForm(p => ({ ...p, role: e.target.value }))}
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white">
                    <option value="tenant">Tenant</option>
                    <option value="owner">Owner</option>
                  </select>
                )}
              </div>
              <div>
                <label className="block text-sm mb-2 text-neutral-700 dark:text-neutral-300">Phone Number</label>
                <input value={editForm.phone} onChange={(e) => setEditForm(p => ({ ...p, phone: e.target.value }))}
                  className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white" />
              </div>
              <div>
                <label className="block text-sm mb-2 text-neutral-700 dark:text-neutral-300">Profile Photo</label>
                <input type="file" accept="image/*" onChange={(e) => handleImageFile(e.target.files?.[0])}
                  className="block w-full text-sm text-neutral-700 dark:text-neutral-200 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-cyan-50 file:text-cyan-700 hover:file:bg-cyan-100 dark:file:bg-cyan-900/40 dark:file:text-cyan-300" />
              </div>
              <div className="flex items-center justify-between">
                <button type="submit" disabled={saving} className="inline-flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg">
                  <Save className="h-4 w-4 mr-2" /> {saving ? 'Saving...' : 'Save Changes'}
                </button>
                {user?.role !== 'admin' && (
                  <button onClick={async (e) => {
                    e.preventDefault();
                    if (!window.confirm('Are you sure you want to delete your profile?')) return;
                    try { await deleteCurrentUser(); await logout(); navigate('/'); } catch { alert('Failed to delete account'); }
                  }} className="inline-flex px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs">Delete Account</button>
                )}
              </div>
            </div>
          </form>
        </div>

        {/* ─── Change Email ──────────────────────────────────────────────────────── */}
        <div className="bg-white dark:bg-neutral-800 rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-cyan-100 dark:bg-cyan-900/30 rounded-full flex items-center justify-center"><Mail className="w-5 h-5 text-cyan-600" /></div>
              <div>
                <h3 className="font-semibold text-neutral-900 dark:text-white">Email Address</h3>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">{user.email}</p>
              </div>
            </div>
            <button onClick={() => setEmailModal('password')} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm">Change Email</button>
          </div>
        </div>

        {/* ─── Two-Step Verification ─────────────────────────────────────────────── */}
        <div className="bg-white dark:bg-neutral-800 rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${user.twoFactorEnabled ? 'bg-green-100 dark:bg-green-900/30' : 'bg-neutral-100 dark:bg-neutral-700'}`}>
                <Shield className={`w-5 h-5 ${user.twoFactorEnabled ? 'text-green-600' : 'text-neutral-400'}`} />
              </div>
              <div>
                <h3 className="font-semibold text-neutral-900 dark:text-white">Two-Step Verification</h3>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">{user.twoFactorEnabled ? 'Enabled — OTP required on every login' : 'Disabled — Single step login'}</p>
              </div>
            </div>
            <button onClick={() => { setTfaModal(true); setTfaError(''); setTfaPassword(''); }}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${user.twoFactorEnabled ? 'bg-green-500' : 'bg-neutral-300 dark:bg-neutral-600'}`}>
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform shadow ${user.twoFactorEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>

        {/* Owner Properties */}
        {isOwner && (
          <div className="bg-white dark:bg-neutral-800 rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-white flex items-center"><Building2 className="h-5 w-5 mr-2" /> My Properties</h2>
              <button onClick={() => navigate('/properties/new')} className="px-3 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm">+ Add Property</button>
            </div>
            {ownerProps.length === 0 ? (
              <div className="text-neutral-500 dark:text-neutral-400">You have no properties yet.</div>
            ) : (
              <div className="space-y-3">
                {ownerProps.map(p => (
                  <div key={p._id} className="flex items-center justify-between border border-neutral-200 dark:border-neutral-700 rounded-lg p-3">
                    <div className="flex items-center space-x-3">
                      <img src={p.images?.[0] || '/api/placeholder/80/80'} alt={p.title} className="w-14 h-14 object-cover rounded" />
                      <div><div className="font-medium text-neutral-900 dark:text-white">{p.title}</div><div className="text-sm text-neutral-600 dark:text-neutral-400">{p.location}</div></div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => navigate(`/properties/${p._id}`)} className="p-2 text-neutral-600 dark:text-neutral-300 hover:text-cyan-600"><Eye className="h-4 w-4" /></button>
                      <button onClick={() => navigate(`/properties/${p._id}/edit`)} className="p-2 text-neutral-600 dark:text-neutral-300 hover:text-blue-600"><Edit className="h-4 w-4" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══ Change Email Modal ═══════════════════════════════════════════════ */}
      {emailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={closeEmailModal}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white dark:bg-neutral-800 rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-slide-up" onClick={e => e.stopPropagation()}>
            <button onClick={closeEmailModal} className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-600"><X className="w-5 h-5" /></button>
            {emailError && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-lg flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" /><span className="text-red-700 dark:text-red-300 text-sm">{emailError}</span>
              </div>
            )}
            {emailModal === 'password' && (
              <>
                <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-4">Verify Identity</h3>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">Enter your current password to continue.</p>
                <div className="relative mb-4">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                  <input type="password" value={emailPassword} onChange={(e) => { setEmailPassword(e.target.value); setEmailError(''); }} autoFocus
                    className="w-full h-11 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-cyan-600 pl-12"
                    placeholder="Current password" />
                </div>
                <button onClick={() => { if (!emailPassword) { setEmailError('Password required'); return; } setEmailModal('newEmail'); }}
                  className="w-full bg-cyan-600 hover:bg-cyan-700 text-white py-2.5 rounded-lg font-medium">Continue</button>
              </>
            )}
            {emailModal === 'newEmail' && (
              <>
                <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-4">New Email Address</h3>
                <div className="relative mb-4">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                  <input type="email" value={newEmail} onChange={(e) => { setNewEmail(e.target.value); setEmailError(''); }} autoFocus
                    className="w-full h-11 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-cyan-600 pl-12"
                    placeholder="Enter new email" />
                </div>
                <button onClick={handleEmailSendOtp} disabled={emailLoading}
                  className="w-full bg-cyan-600 hover:bg-cyan-700 text-white py-2.5 rounded-lg font-medium disabled:opacity-50">
                  {emailLoading ? 'Sending...' : 'Send Verification Code'}
                </button>
              </>
            )}
            {emailModal === 'otp' && (
              <>
                <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-2">Verify New Email</h3>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">Enter the code sent to <strong>{newEmail}</strong></p>
                <div className="relative mb-4">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                  <input type="text" value={emailOtp} onChange={(e) => setEmailOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} maxLength={6} autoFocus
                    className="w-full h-12 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 text-center text-2xl tracking-[0.5em] font-mono focus:outline-none focus:ring-2 focus:ring-cyan-600 pl-12" placeholder="000000" />
                </div>
                <button onClick={handleEmailVerifyOtp} disabled={emailLoading || emailOtp.length !== 6}
                  className="w-full bg-cyan-600 hover:bg-cyan-700 text-white py-2.5 rounded-lg font-medium disabled:opacity-50">
                  {emailLoading ? 'Verifying...' : 'Verify & Update Email'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══ 2FA Toggle Modal ════════════════════════════════════════════════ */}
      {tfaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setTfaModal(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white dark:bg-neutral-800 rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-slide-up" onClick={e => e.stopPropagation()}>
            <button onClick={() => setTfaModal(false)} className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-600"><X className="w-5 h-5" /></button>
            <div className="flex items-center gap-3 mb-4">
              <Shield className="w-6 h-6 text-cyan-600" />
              <h3 className="text-lg font-bold text-neutral-900 dark:text-white">{user.twoFactorEnabled ? 'Disable' : 'Enable'} Two-Step Verification</h3>
            </div>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">Enter your password to confirm this change.</p>
            {tfaError && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-lg flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" /><span className="text-red-700 dark:text-red-300 text-sm">{tfaError}</span>
              </div>
            )}
            <div className="relative mb-4">
              <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
              <input type="password" value={tfaPassword} onChange={(e) => { setTfaPassword(e.target.value); setTfaError(''); }} autoFocus
                className="w-full h-11 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-cyan-600 pl-12"
                placeholder="Enter your password" />
            </div>
            <button onClick={handleToggle2FA} disabled={tfaLoading || !tfaPassword}
              className={`w-full py-2.5 rounded-lg font-medium text-white disabled:opacity-50 ${user.twoFactorEnabled ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}>
              {tfaLoading ? 'Processing...' : user.twoFactorEnabled ? 'Disable 2FA' : 'Enable 2FA'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileSettings;
