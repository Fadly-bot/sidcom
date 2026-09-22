import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiClient, setAccessToken } from './api-client';

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: string;
  timezone: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string, timezone?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchCurrentUser = async () => {
    try {
      const data = await apiClient<{ user: User }>('/api/v1/users/me');
      setUser(data.user);
    } catch {
      setUser(null);
      setAccessToken(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Attempt silent session recovery
    fetchCurrentUser();
  }, []);

  const login = async (email: string, password: string) => {
    const data = await apiClient<{ accessToken: string; user: User }>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
      skipAuth: true,
    });
    setAccessToken(data.accessToken);
    setUser(data.user);
  };

  const register = async (email: string, password: string, displayName: string, timezone?: string) => {
    const data = await apiClient<{ accessToken: string; user: User }>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        displayName,
        timezone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Jakarta',
      }),
      skipAuth: true,
    });
    setAccessToken(data.accessToken);
    setUser(data.user);
  };

  const logout = async () => {
    try {
      await apiClient('/api/v1/auth/logout', { method: 'POST' });
    } catch {
      // Ignore logout failure
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  };

  const refreshProfile = async () => {
    await fetchCurrentUser();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        register,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
