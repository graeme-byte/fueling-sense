'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import HeaderLogo from '@/components/shared/HeaderLogo';

type SubmissionType = 'bug' | 'help' | 'feedback';

interface BillingData {
  tier:              string;
  hasStripe:         boolean;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd:  string | null;
}

const TYPES: { value: SubmissionType; label: string; description: string }[] = [
  { value: 'bug',      label: 'Bug report',     description: 'Something is broken or behaving unexpectedly' },
  { value: 'help',     label: 'Help / question', description: 'Not sure how something works' },
  { value: 'feedback', label: 'Feedback',        description: 'Suggestions, ideas, or general thoughts' },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

export default function SupportPage() {
  const [type,          setType]          = useState<SubmissionType>('help');
  const [topic,         setTopic]         = useState('');
  const [message,       setMessage]       = useState('');
  const [name,          setName]          = useState('');
  const [status,        setStatus]        = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMsg,      setErrorMsg]      = useState('');
  const [isLoggedIn,    setIsLoggedIn]    = useState(false);
  const [billingData,   setBillingData]   = useState<BillingData | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  // Account deletion state
  const [deleteStep,    setDeleteStep]    = useState<'idle' | 'confirming' | 'deleting' | 'error'>('idle');
  const [deleteError,   setDeleteError]   = useState('');

  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => {
      setIsLoggedIn(!!user);
      if (user) {
        fetch('/api/billing')
          .then(r => r.json())
          .then(d => { if (d.authenticated) setBillingData(d); })
          .catch(() => {});
      }
    });
  }, []);

  async function handlePortal() {
    setPortalLoading(true);
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
      // silent — portal is optional convenience
    } finally {
      setPortalLoading(false);
    }
  }

  async function handleDeleteAccount() {
    setDeleteStep('deleting');
    setDeleteError('');
    try {
      const res = await fetch('/api/account/delete', { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setDeleteError(data.error ?? 'Something went wrong. Please try again or contact support.');
        setDeleteStep('error');
        return;
      }

      // Sign out and redirect whether deletion was full or partial
      await createClient().auth.signOut();
      window.location.href = '/?account=deleted';
    } catch {
      setDeleteError('Network error. Please check your connection and try again.');
      setDeleteStep('error');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    setErrorMsg('');

    try {
      const res = await fetch('/api/support', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ type, topic, message, name }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Unexpected error');
      }

      setStatus('sent');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong');
      setStatus('error');
    }
  }

  if (status === 'sent') {
    return (
      <main className="min-h-screen bg-gradient-to-br from-violet-950 via-violet-900 to-blue-900 text-white flex flex-col">
        <Header isLoggedIn={isLoggedIn} />
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="bg-white/10 backdrop-blur border border-white/20 rounded-2xl p-10 max-w-md w-full text-center">
            <div className="text-4xl mb-4">✓</div>
            <h2 className="text-xl font-black mb-2">Message sent</h2>
            <p className="text-sm opacity-60 mb-6">We&apos;ll get back to you at the email you used to sign up.</p>
            <Link
              href="/"
              className="inline-block px-6 py-2 bg-white text-violet-900 font-bold rounded-xl text-sm hover:bg-violet-100 transition"
            >
              Back to home
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const showBilling = isLoggedIn && billingData && billingData.tier === 'pro';

  return (
    <main className="min-h-screen bg-gradient-to-br from-violet-950 via-violet-900 to-blue-900 text-white flex flex-col">
      <Header isLoggedIn={isLoggedIn} />

      <div className="flex-1 flex items-start justify-center px-6 py-12">
        <div className="w-full max-w-lg space-y-10">

          {/* ── Billing section — Pro users only ─────────────────── */}
          {showBilling && (
            <div>
              <h2 className="text-xs font-black uppercase tracking-widest text-violet-300 mb-3">
                Billing
              </h2>

              <div className="bg-white/10 backdrop-blur border border-white/20 rounded-2xl p-5 space-y-4">

                {/* Subscription status */}
                {billingData.cancelAtPeriodEnd ? (
                  <div className="bg-amber-500/10 border border-amber-400/30 rounded-xl px-4 py-3">
                    <p className="text-sm font-bold text-amber-300">Subscription ending</p>
                    <p className="text-xs text-white/60 mt-0.5">
                      Your subscription has been cancelled and will remain active until{' '}
                      {billingData.currentPeriodEnd ? formatDate(billingData.currentPeriodEnd) : 'the end of your billing period'}.
                    </p>
                  </div>
                ) : (
                  <div className="bg-green-500/10 border border-green-400/30 rounded-xl px-4 py-3">
                    <p className="text-sm font-bold text-green-300">Subscription active</p>
                    <p className="text-xs text-white/60 mt-0.5">
                      {billingData.currentPeriodEnd
                        ? `Your Pro access is active. Renews ${formatDate(billingData.currentPeriodEnd)}.`
                        : 'Your Pro access is active.'}
                    </p>
                  </div>
                )}

                {/* Portal button or fallback */}
                <div>
                  <p className="text-sm text-white/70 mb-3">
                    Manage your subscription, payment method, invoices, or cancel your plan.
                  </p>
                  {billingData.hasStripe ? (
                    <button
                      type="button"
                      onClick={handlePortal}
                      disabled={portalLoading}
                      className="px-5 py-2.5 bg-white text-violet-900 font-bold rounded-xl text-sm hover:bg-violet-100 transition disabled:opacity-50"
                    >
                      {portalLoading ? 'Opening…' : 'Manage subscription'}
                    </button>
                  ) : (
                    <p className="text-xs text-white/40 italic">
                      Subscription management is not available for this account yet.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Privacy & Data — authenticated users only ─────────── */}
          {isLoggedIn && (
            <div>
              <h2 className="text-xs font-black uppercase tracking-widest text-violet-300 mb-3">
                Privacy &amp; Data
              </h2>

              <div className="bg-white/10 backdrop-blur border border-white/20 rounded-2xl p-5">

                {deleteStep === 'idle' && (
                  <div className="flex items-start justify-between gap-6">
                    <div>
                      <p className="text-sm font-bold text-white mb-1">Delete account and all data</p>
                      <p className="text-xs text-white/60 leading-relaxed">
                        Permanently removes your saved profile, fueling plans, and all associated account data.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDeleteStep('confirming')}
                      className="shrink-0 px-4 py-2 text-xs font-bold text-red-300 border border-red-400/40 rounded-lg hover:bg-red-500/10 transition"
                    >
                      Delete account
                    </button>
                  </div>
                )}

                {deleteStep === 'confirming' && (
                  <div className="space-y-4">
                    <div className="bg-red-500/10 border border-red-400/30 rounded-xl px-4 py-3">
                      <p className="text-sm font-bold text-red-300 mb-1">Are you sure?</p>
                      <p className="text-xs text-white/70 leading-relaxed">
                        Deleting your account will permanently remove your saved profile, fueling plans,
                        and associated account data. This cannot be undone.
                      </p>
                    </div>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={handleDeleteAccount}
                        className="px-5 py-2 text-sm font-bold bg-red-500 text-white rounded-lg hover:bg-red-600 transition"
                      >
                        Yes, delete everything
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteStep('idle')}
                        className="px-5 py-2 text-sm font-semibold bg-white/10 text-white rounded-lg hover:bg-white/20 transition"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {deleteStep === 'deleting' && (
                  <p className="text-sm text-white/60">Deleting account and all data…</p>
                )}

                {deleteStep === 'error' && (
                  <div className="space-y-3">
                    <p className="text-sm text-red-300 bg-red-500/10 border border-red-400/20 rounded-xl px-4 py-3">
                      {deleteError}
                    </p>
                    <button
                      type="button"
                      onClick={() => setDeleteStep('idle')}
                      className="text-xs text-white/60 hover:text-white transition underline"
                    >
                      Dismiss
                    </button>
                  </div>
                )}

              </div>
            </div>
          )}

          {/* ── Support form ──────────────────────────────────────── */}
          <div>
            <div className="mb-8">
              <h1 className="text-3xl font-black mb-2">Contact support</h1>
              <p className="text-sm opacity-60">
                Bug reports, questions, or feedback — we read everything.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">

              {/* Type selector */}
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-violet-300 mb-2">
                  What is this about?
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {TYPES.map(t => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setType(t.value)}
                      className={`rounded-xl px-3 py-3 text-left transition border ${
                        type === t.value
                          ? 'bg-white text-violet-900 border-white shadow'
                          : 'bg-white/10 border-white/20 hover:bg-white/20 text-white'
                      }`}
                    >
                      <p className="text-xs font-black leading-tight">{t.label}</p>
                      <p className={`text-xs mt-0.5 leading-tight ${type === t.value ? 'opacity-50' : 'opacity-40'}`}>
                        {t.description}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Topic */}
              <div>
                <label htmlFor="topic" className="block text-xs font-black uppercase tracking-widest text-violet-300 mb-2">
                  Subject / topic
                </label>
                <input
                  id="topic"
                  type="text"
                  required
                  maxLength={120}
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  placeholder={
                    type === 'bug'  ? 'e.g. Fueling results page' :
                    type === 'help' ? 'e.g. Calculator input question' :
                                     'e.g. Zone display suggestion'
                  }
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-violet-400"
                />
              </div>

              {/* Message */}
              <div>
                <label htmlFor="message" className="block text-xs font-black uppercase tracking-widest text-violet-300 mb-2">
                  Message
                </label>
                <textarea
                  id="message"
                  required
                  rows={5}
                  maxLength={2000}
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Describe the issue or question in as much detail as you can…"
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
                />
              </div>

              {/* Name (optional) */}
              <div>
                <label htmlFor="name" className="block text-xs font-black uppercase tracking-widest text-violet-300 mb-2">
                  Your name <span className="font-normal normal-case opacity-50">(optional)</span>
                </label>
                <input
                  id="name"
                  type="text"
                  maxLength={80}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="How should we address you?"
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-violet-400"
                />
              </div>

              {status === 'error' && (
                <p className="text-sm text-red-300 bg-red-500/10 border border-red-400/20 rounded-xl px-4 py-3">
                  {errorMsg}
                </p>
              )}

              <button
                type="submit"
                disabled={status === 'sending'}
                className="w-full py-3 bg-white text-violet-900 font-black rounded-xl hover:bg-violet-100 transition disabled:opacity-50"
              >
                {status === 'sending' ? 'Sending…' : 'Send message'}
              </button>

            </form>
          </div>
        </div>
      </div>
    </main>
  );
}

function Header({ isLoggedIn }: { isLoggedIn: boolean }) {
  return (
    <header className="bg-white px-8 py-3 flex items-center justify-between shadow-sm">
      <HeaderLogo href={isLoggedIn ? '/calculator/profiler' : '/'} />
    </header>
  );
}
