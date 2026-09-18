import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { backend } from '../utils/backend';
const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);
export function AuthProvider({
  children
}) {
  const [state, setState] = useState({
    user: null,
    profile: null,
    configured: false,
    loading: true,
    error: null
  });
  const requestId = useRef(0);
  const reload = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const result = await backend('auth');
      if (id === requestId.current) setState({
        ...result,
        loading: false,
        error: null
      });
    } catch (error) {
      if (id === requestId.current) setState(prev => ({
        ...prev,
        loading: false,
        error: error.message
      }));
    }
  }, []);
  useEffect(() => {
    reload();
    window.addEventListener('focus', reload);
    return () => {
      requestId.current++;
      window.removeEventListener('focus', reload);
    };
  }, [reload]);
  const signOut = async () => {
    await backend('auth?action=logout', {});
    requestId.current++;
    setState(previous => ({...previous, user: null, profile: null, error: null}));
  };
  return <AuthContext.Provider value={{
    ...state,
    reload,
    signOut
  }}>{children}</AuthContext.Provider>;
}
