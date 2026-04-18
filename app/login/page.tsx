'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { signIn } from '@/app/actions/auth';
import Link from 'next/link';
import { Suspense } from 'react';
import HeaderLogo from '@/components/shared/HeaderLogo';

type Mode = 'login' | 'signup' | 'forgot' | 'reset';

function LoginForm() {
  const searchParams = useSearchParams();
  const redirectTo   = searchParams.get('redirect') ?? '/calculator/profiler';
  const reason       = searchParams.get('reason');

  const [mode,            setMode]            = useState<Mode>('login');
  const [email,           setEmail]           = useState('');
  const [password,        setPassword]        = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState<string | null>(null);
  const [sent,            setSent]            = useState<'signup' | 'forgot' | null>(null);

  const supabase = createClient();

  // Switch to reset-password form when user returns via the email link
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setMode('reset');
    });
    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setConfirmPassword('');
  }

  // ── Login / Signup handler ──────────────────────────────────
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    if (mode === 'login') {
      const result = await signIn(redirectTo, email, password);
      if (result?.error) { setError(result.error); setLoading(false); return; }
      // On success, signIn() calls redirect() server-side — navigation is automatic.
    } else {
      const { error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) { setError(signUpError.message); setLoading(false); return; }
      setSent('signup');
    }

    setLoading(false);
  }

  // ── Forgot password handler ─────────────────────────────────
  async function handleForgotPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/login`,
    });
    // Always show neutral message — never reveal whether the account exists.
    setSent('forgot');
    setLoading(false);
  }

  // ── Reset password handler ──────────────────────────────────
  async function handleResetPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) { setError(updateError.message); setLoading(false); return; }
    window.location.href = '/calculator/profiler';
  }

  // ── Confirmation screens ────────────────────────────────────
  if (sent === 'signup') {
    return (
      <div className="text-center">
        <p className="text-2xl font-black mb-2">Check your email</p>
        <p className="text-gray-500 text-sm mb-6">
          We sent a confirmation link to <strong>{email}</strong>
        </p>
        <div className="flex flex-col gap-2 text-sm">
          <Link href="/pricing" className="text-violet-600 font-semibold hover:underline">
            Back to pricing
          </Link>
          <Link href="/" className="text-gray-400 hover:text-gray-600 transition">
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  if (sent === 'forgot') {
    return (
      <div className="text-center">
        <p className="text-2xl font-black mb-2">Check your email</p>
        <p className="text-gray-500 text-sm mb-6">
          If an account exists for that email, a reset link has been sent.
        </p>
        <button
          type="button"
          onClick={() => { setSent(null); switchMode('login'); }}
          className="text-violet-600 font-semibold hover:underline text-sm"
        >
          Back to sign in
        </button>
      </div>
    );
  }

  // ── Forgot password form ────────────────────────────────────
  if (mode === 'forgot') {
    return (
      <form onSubmit={handleForgotPassword} className="space-y-4 w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-black text-gray-900">Reset password</h1>
          <p className="text-sm text-gray-500 mt-1">
            Enter your email and we&apos;ll send a reset link.
          </p>
        </div>

        <input
          type="email" required autoFocus
          placeholder="Email"
          value={email} onChange={e => setEmail(e.target.value)}
          className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
        />

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <button
          type="submit" disabled={loading}
          className="w-full py-3 bg-gradient-to-r from-violet-600 to-blue-600 text-white font-bold rounded-xl hover:opacity-90 transition disabled:opacity-50"
        >
          {loading ? 'Sending…' : 'Send reset link'}
        </button>

        <p className="text-center text-sm text-gray-500">
          <button
            type="button"
            onClick={() => switchMode('login')}
            className="text-violet-600 font-semibold hover:underline"
          >
            Back to sign in
          </button>
        </p>
      </form>
    );
  }

  // ── Set new password form (arrived via email reset link) ────
  if (mode === 'reset') {
    return (
      <form onSubmit={handleResetPassword} className="space-y-4 w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-black text-gray-900">Set new password</h1>
        </div>

        <input
          type="password" required minLength={8} autoFocus
          placeholder="New password"
          value={password} onChange={e => setPassword(e.target.value)}
          className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
        <input
          type="password" required minLength={8}
          placeholder="Confirm new password"
          value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
          className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
        />

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <button
          type="submit" disabled={loading}
          className="w-full py-3 bg-gradient-to-r from-violet-600 to-blue-600 text-white font-bold rounded-xl hover:opacity-90 transition disabled:opacity-50"
        >
          {loading ? 'Please wait…' : 'Update password'}
        </button>
      </form>
    );
  }

  // ── Login / Signup form ─────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} className="space-y-4 w-full max-w-sm">
      <div className="text-center mb-6">
        <h1 className="text-2xl font-black text-gray-900">
          {mode === 'login' ? 'Sign in' : 'Create account'}
        </h1>
        {reason === 'pro_required' && (
          <p className="text-sm text-violet-600 mt-1 font-semibold">
            Sign in to access the Pro Fueling Calculator
          </p>
        )}
      </div>

      <input
        type="email" required autoFocus
        placeholder="Email"
        value={email} onChange={e => setEmail(e.target.value)}
        className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
      />
      <input
        type="password" required minLength={8}
        placeholder="Password"
        value={password} onChange={e => setPassword(e.target.value)}
        className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
      />

      {mode === 'signup' && (
        <input
          type="password" required minLength={8}
          placeholder="Confirm password"
          value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
          className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
      )}

      {mode === 'login' && (
        <div className="text-right -mt-1">
          <button
            type="button"
            onClick={() => switchMode('forgot')}
            className="text-xs text-gray-400 hover:text-violet-600 transition"
          >
            Forgot password?
          </button>
        </div>
      )}

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <button
        type="submit" disabled={loading}
        className="w-full py-3 bg-gradient-to-r from-violet-600 to-blue-600 text-white font-bold rounded-xl hover:opacity-90 transition disabled:opacity-50"
      >
        {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
      </button>

      <p className="text-center text-sm text-gray-500">
        {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
        <button
          type="button"
          onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
          className="text-violet-600 font-semibold hover:underline"
        >
          {mode === 'login' ? 'Sign up' : 'Sign in'}
        </button>
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6">
      <HeaderLogo href="/" className="mb-10" />
      <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-200 w-full max-w-sm">
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
