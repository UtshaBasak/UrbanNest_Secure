import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  const [isDark, setIsDark] = useState(() => {
    // Check for saved theme preference or fall back to the OS preference
    let savedTheme = null;
    try {
      savedTheme = localStorage.getItem('theme');
    } catch {
      // Storage may be unavailable (private mode, blocked site data)
    }
    let prefersDark = false;
    try {
      prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      // matchMedia unavailable
    }
    return savedTheme === 'dark' || (!savedTheme && prefersDark);
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    try {
      localStorage.setItem('theme', next ? 'dark' : 'light');
    } catch {
      // Ignore storage failures; the theme still applies for this session
    }
  };

  const value = {
    isDark,
    toggleTheme
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};