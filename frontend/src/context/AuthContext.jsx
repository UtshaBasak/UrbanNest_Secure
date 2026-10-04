import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as authAPI from '../utils/api';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Ensure the user object always exposes both `id` and `_id`
const normalizeUser = (u) => {
  if (!u) return null;
  const id = u._id || u.id;
  return id ? { ...u, id, _id: id } : u;
};

// Share a single in-flight /auth/refresh request so concurrent callers
// (e.g. StrictMode's double-invoked effects) don't trigger duplicate refreshes
let refreshInFlight = null;
const refreshOnce = () => {
  if (!refreshInFlight) {
    refreshInFlight = authAPI.refreshToken().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
};

export const AuthProvider = ({ children }) => {
  const [user, setUserState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [requires2FA, setRequires2FA] = useState(false);
  const [tempToken, setTempToken] = useState(null);
  const [passwordExpired, setPasswordExpired] = useState(false);

  const setUser = useCallback((next) => {
    setUserState((prev) => normalizeUser(typeof next === 'function' ? next(prev) : next));
  }, []);

  // Apply a user + password-expiry state from an auth response
  const applyAuthResponse = useCallback((response) => {
    const nextUser = response?.data?.user || null;
    setUser(nextUser);
    setPasswordExpired(Boolean(response?.passwordExpired || nextUser?.passwordExpired));
  }, [setUser]);

  const checkAuthStatus = useCallback(async () => {
    try {
      const response = await authAPI.getCurrentUser();
      applyAuthResponse(response);
    } catch {
      try {
        const refreshRes = await refreshOnce();
        applyAuthResponse(refreshRes);
      } catch {
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, [applyAuthResponse, setUser]);

  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  // Auto-refresh access token every 13 minutes
  const isLoggedIn = Boolean(user);
  useEffect(() => {
    if (!isLoggedIn) return;
    const interval = setInterval(async () => {
      try {
        await refreshOnce();
      } catch {
        // Refresh failed: the session is no longer valid
        setUser(null);
      }
    }, 13 * 60 * 1000);
    return () => clearInterval(interval);
  }, [isLoggedIn, setUser]);

  const login = async (email, password) => {
    const response = await authAPI.login(email, password);
    if (response.requires2FA) {
      setRequires2FA(true);
      setTempToken(response.tempToken);
      return { requires2FA: true };
    }
    applyAuthResponse(response);
    return response.data;
  };

  const complete2FA = async (otp) => {
    const response = await authAPI.verify2FA(tempToken, otp);
    applyAuthResponse(response);
    setRequires2FA(false);
    setTempToken(null);
    return response.data;
  };

  const register = async (userData) => {
    const response = await authAPI.register(userData);
    applyAuthResponse(response);
    return response.data;
  };

  const logout = async () => {
    try {
      await authAPI.logout();
    } catch {
      // Clear local session state even if the server call fails
    } finally {
      setUser(null);
      setRequires2FA(false);
      setTempToken(null);
      setPasswordExpired(false);
    }
  };

  const updateProfile = async (profileData) => {
    const userId = user?._id || user?.id;
    if (!userId) throw new Error('No user');
    const response = await authAPI.updateProfile(userId, profileData);
    setUser(response.data.user);
    return response.data;
  };

  const clearPasswordExpired = () => setPasswordExpired(false);

  const value = {
    user,
    setUser,
    loading,
    login,
    register,
    logout,
    updateProfile,
    checkAuthStatus,
    requires2FA,
    complete2FA,
    passwordExpired,
    clearPasswordExpired,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
