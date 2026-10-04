import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, getToken, setToken } from './api.js';
import { useToast } from './toast.jsx';

const AuthCtx = createContext(null);

export const homeFor = (user) => {
  switch (user?.role) {
    case 'ADMIN': return '/admin';
    case 'OPERATOR': return '/operator';
    case 'FLEET_MANAGER': return '/fleet';
    default: return '/';
  }
};

/**
 * useAuth() -> { user, ready, isAuthed, login(email,pw), register(body), logout(), refreshUser(),
 *                hasRole(...roles), isAdmin, isOperator, isFleet, isUser, homeFor(user) }
 * Redirect-after-login: ProtectedRoute/openBooking navigate to /login with state {from: location, openBooking?};
 * Login.jsx returns the user to `from` after success.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(!getToken());
  const navigate = useNavigate();
  const loc = useLocation();
  const toast = useToast();

  const refreshUser = useCallback(async () => {
    if (!getToken()) { setUser(null); return null; }
    try { const u = await api.get('/auth/me'); setUser(u); return u; } catch { return null; }
  }, []);

  useEffect(() => { if (getToken()) refreshUser().finally(() => setReady(true)); }, [refreshUser]);

  useEffect(() => {
    const h = () => {
      setToken(null); setUser(null);
      toast.info('Your session has expired. Please sign in again.');
      navigate('/login', { state: { from: loc }, replace: true });
    };
    window.addEventListener('chargeiq:unauthorized', h);
    return () => window.removeEventListener('chargeiq:unauthorized', h);
  }, [navigate, loc, toast]);

  const login = useCallback(async (email, password) => {
    const res = await api.post('/auth/login', { email, password }, { auth: false });
    setToken(res.token); setUser(res.user); setReady(true);
    return res.user;
  }, []);
  const register = useCallback(async (body) => {
    await api.post('/auth/register', body, { auth: false });
    return login(body.email, body.password);
  }, [login]);
  const logout = useCallback(() => {
    setToken(null); setUser(null);
    try { sessionStorage.clear(); } catch { /* */ }
    navigate('/login', { replace: true });
  }, [navigate]);

  const value = useMemo(() => {
    const role = user?.role;
    return {
      user, ready, isAuthed: !!user, login, register, logout, refreshUser, homeFor,
      hasRole: (...roles) => !!role && roles.includes(role),
      isAdmin: role === 'ADMIN', isOperator: role === 'OPERATOR', isFleet: role === 'FLEET_MANAGER', isUser: role === 'USER',
    };
  }, [user, ready, login, register, logout, refreshUser]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
export const useAuth = () => useContext(AuthCtx);
