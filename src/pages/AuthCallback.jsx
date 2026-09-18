import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { backend } from '../utils/backend';
export default function AuthCallback() {
  const navigate = useNavigate();
  const {
    reload
  } = useAuth();
  const started = useRef(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const params = new URLSearchParams(location.hash.slice(1));
    const recovery = params.get('type') === 'recovery';
    // Remove token material from the URL before any further navigation.
    history.replaceState(null, '', '/auth/callback');
    backend('auth?action=email-callback', {
      access_token: params.get('access_token'),
      refresh_token: params.get('refresh_token')
    }).then(async () => {
      await reload();
      navigate(`/profile${recovery ? '?recovery=1' : ''}`, {
        replace: true
      });
    }).catch(e => setError(e.message));
  }, [reload, navigate]);
  return <main className="mx-auto max-w-xl p-8">{error ? <p role="alert">{error} <a href="/profile">Return to sign in</a></p> : <p>Confirming your account…</p>}</main>;
}
