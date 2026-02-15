import { createContext, useState, useEffect, useCallback, useContext } from 'react';
import * as authApi from '../api/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('splitsmart_token');
    if (token) {
      authApi.getMe()
        .then(data => setUser(data.user))
        .catch(() => {
          localStorage.removeItem('splitsmart_token');
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await authApi.login(email, password);
    localStorage.setItem('splitsmart_token', data.token);
    setUser(data.user);
    return data;
  }, []);

  const signup = useCallback(async (email, password, name) => {
    const data = await authApi.signup(email, password, name);
    localStorage.setItem('splitsmart_token', data.token);
    setUser(data.user);
    return data;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('splitsmart_token');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

export default AuthContext;
