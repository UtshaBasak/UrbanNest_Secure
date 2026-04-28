import React, { createContext, useContext, useState, useEffect } from 'react';
import * as authAPI from '../utils/api';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [requires2FA, setRequires2FA] = useState(false);
  const [tempToken, setTempToken] = useState(null);
  const [passwordExpired, setPasswordExpired] = useState(false);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  // Auto-refresh access token every 13 minutes
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(async () => {
      try {
        await authAPI.refreshToken();
      } catch {
        // Refresh failed
      }
    }, 13 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user]);

  const checkAuthStatus = async () => {
    try {
      const response = await authAPI.getCurrentUser();
      setUser(response.data.user);
      if (response.data.user?.passwordExpired) {
        setPasswordExpired(true);
      }
    } catch (error) {
      try {
        const refreshRes = await authAPI.refreshToken();
        setUser(refreshRes.data.user);
      } catch {
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      const response = await authAPI.login(email, password);
      if (response.requires2FA) {
        setRequires2FA(true);
        setTempToken(response.tempToken);
        return { requires2FA: true };
      }
      setUser(response.data.user);
      if (response.passwordExpired) {
        setPasswordExpired(true);
      }
      return response.data;
    } catch (error) {
      throw error;
    }
  };

  const complete2FA = async (otp) => {
    try {
      const response = await authAPI.verify2FA(tempToken, otp);
      setUser(response.data.user);
      setRequires2FA(false);
      setTempToken(null);
      if (response.passwordExpired) {
        setPasswordExpired(true);
      }
      return response.data;
    } catch (error) {
      throw error;
    }
  };

  const register = async (userData) => {
    try {
      const response = await authAPI.register(userData);
      setUser(response.data.user);
      return response.data;
    } catch (error) {
      throw error;
    }
  };

  const logout = async () => {
    try {
      await authAPI.logout();
      setUser(null);
      setRequires2FA(false);
      setTempToken(null);
      setPasswordExpired(false);
    } catch (error) {
      setUser(null);
    }
  };

  const updateProfile = async (profileData) => {
    try {
      const userId = user?._id || user?.id;
      if (!userId) throw new Error('No user');
      const response = await authAPI.updateProfile(userId, profileData);
      setUser(response.data.user);
      return response.data;
    } catch (error) {
      throw error;
    }
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
