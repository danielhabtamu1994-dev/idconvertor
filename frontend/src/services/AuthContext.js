import { createContext, useContext, useState, useEffect } from 'react';
import API from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const u = localStorage.getItem('user');
    return u ? JSON.parse(u) : null;
  });

  // Refresh balance from server on load
  useEffect(() => {
    if (!user) return;
    API.get('/auth/me').then(({ data }) => {
      const updated = { ...user, balance: data.balance };
      setUser(updated);
      localStorage.setItem('user', JSON.stringify(updated));
    }).catch(() => {});
  }, []);

  const login = (token, role, username, balance = 0) => {
    localStorage.setItem('token', token);
    const u = { role, username, balance };
    localStorage.setItem('user', JSON.stringify(u));
    setUser(u);
  };

  const logout = () => {
    localStorage.clear();
    setUser(null);
  };

  const refreshBalance = async () => {
    try {
      const { data } = await API.get('/auth/me');
      const updated = { ...user, balance: data.balance };
      setUser(updated);
      localStorage.setItem('user', JSON.stringify(updated));
    } catch {}
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, refreshBalance }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
