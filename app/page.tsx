import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import LogoutButton from '@/components/LogoutButton';
import HeaderLogo from '@/components/shared/HeaderLogo';

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <main className="min-h-screen bg-gradient-to-br from-violet-950 via-violet-900 to-blue-900 text-white flex flex-col">

      {/* Header */}
      <header className="bg-white px-8 py-3 flex items-center justify-between shadow-sm">
        <HeaderLogo href={user ? '/calculator/profiler' : '/'} />
        <div className="flex items-center gap-4">
          {user ? (
            <LogoutButton className="text-sm text-gray-500 hover:text-gray-800 transition" />
          ) : (
            <Link href="/login" className="text-sm text-gray-500 hover:text-gray-800 transition">Sign in</Link>
          )}
          <Link
            href="/calculator/profiler"
            className="px-4 py-2 bg-violet-600 text-white font-bold rounded-full text-sm hover:bg-violet-700 transition"
          >
            {user ? 'Launch App' : 'Start Free'}
          </Link>
        </div>
      </header>

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden flex flex-col items-center text-center px-6 pt-24 pb-20 gap-8">

        {/* Background video */}
        <video
          src="/Loop_cyclist.mp4"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          className="absolute inset-0 w-full h-full object-cover object-[center_30%] z-0"
          aria-hidden="true"
        />

        {/* Dark gradient overlay — ensures text remains readable over any frame */}
        <div className="absolute inset-0 z-10 bg-gradient-to-b from-violet-950/80 via-violet-900/70 to-violet-950/90" aria-hidden="true" />

        {/* Hero content — sits above video and overlay */}
        <h1 className="relative z-20 text-5xl font-black tracking-tight max-w-3xl leading-tight">
          Train and fuel based on your physiology —{' '}
          <span className="text-violet-300">not guesswork</span>
        </h1>

        <p className="relative z-20 text-lg opacity-70 max-w-2xl leading-relaxed">
          Start with a simple power test. Unlock your metabolic profile.
          Then turn it into training, nutrition, and race-day execution.
        </p>

        <div className="relative z-20 flex gap-4 flex-wrap justify-center">
          <Link
            href="/calculator/profiler"
            className="px-8 py-4 bg-white text-violet-900 font-black rounded-2xl text-base hover:bg-violet-100 transition shadow-xl"
          >
            Start Free Profiler →
          </Link>
          <Link
            href="/pricing"
            className="px-8 py-4 bg-white/10 border border-white/20 font-bold rounded-2xl text-base hover:bg-white/20 transition"
          >
            Compare Plans
          </Link>
        </div>
      </section>

      {/* ── Journey ───────────────────────────────────────────────────── */}
      <section className="px-8 pb-24 max-w-6xl mx-auto w-full">

        <div className="text-center mb-12">
          <p className="text-xs font-black uppercase tracking-widest text-violet-400 mb-3">The system</p>
          <h2 className="text-3xl font-black">From test to race-day execution</h2>
        </div>

        <div className="grid md:grid-cols-3 gap-6">

          {/* Step 1 — Free */}
          <div className="bg-white/10 backdrop-blur border border-white/20 rounded-2xl p-8 flex flex-col">
            <div className="flex items-center gap-3 mb-5">
              <span className="w-7 h-7 rounded-full bg-green-400 text-green-900 font-black text-xs flex items-center justify-center shrink-0">1</span>
              <span className="text-xs font-black uppercase tracking-widest text-green-400">Free</span>
            </div>
            <h3 className="text-xl font-black mb-2">Measure your engine</h3>
            <p className="text-sm opacity-60 mb-5">
              A 15-minute power test. Four efforts. Your complete metabolic fingerprint.
            </p>
            <ul className="space-y-2 text-sm opacity-80 mb-6 flex-1">
              {['VO2max (ml/kg/min)', 'VLamax (mmol/L/s)', 'Critical Power + W\'', 'Power–duration curve'].map(f => (
                <li key={f} className="flex items-center gap-2">
                  <span className="text-green-400 shrink-0">✓</span> {f}
                </li>
              ))}
            </ul>
            <p className="text-xs opacity-50 italic mb-5">
              "Understand what your engine can produce"
            </p>
            <Link
              href="/calculator/profiler"
              className="block text-center py-3 bg-white text-violet-900 font-bold rounded-xl hover:bg-violet-100 transition"
            >
              Start Free →
            </Link>
          </div>

          {/* Step 2 — Pro */}
          <div className="bg-gradient-to-br from-violet-600 to-blue-600 rounded-2xl p-8 shadow-2xl ring-2 ring-violet-300/30 flex flex-col">
            <div className="flex items-center gap-3 mb-5">
              <span className="w-7 h-7 rounded-full bg-amber-400 text-amber-900 font-black text-xs flex items-center justify-center shrink-0">2</span>
              <span className="text-xs font-black uppercase tracking-widest text-amber-300">Pro</span>
            </div>
            <h3 className="text-xl font-black mb-2">Unlock your physiology</h3>
            <p className="text-sm opacity-80 mb-5">
              Go beyond raw numbers. See where your aerobic and anaerobic thresholds actually sit.
            </p>
            <ul className="space-y-2 text-sm opacity-90 mb-6 flex-1">
              {[
                'LT1 — aerobic threshold (W)',
                'LT2 — anaerobic threshold (W)',
                'Personalised training zones',
                'Track changes after every block',
              ].map(f => (
                <li key={f} className="flex items-center gap-2">
                  <span className="text-amber-300 shrink-0">✓</span> {f}
                </li>
              ))}
            </ul>
            <p className="text-xs opacity-60 italic mb-5">
              "Train with precision instead of guesswork"
            </p>
            <Link
              href="/pricing"
              className="block text-center py-3 bg-amber-400 text-amber-900 font-black rounded-xl hover:bg-amber-300 transition"
            >
              Upgrade to Pro →
            </Link>
          </div>

          {/* Step 3 — Fueling */}
          <div className="bg-white/10 backdrop-blur border border-white/20 rounded-2xl p-8 flex flex-col">
            <div className="flex items-center gap-3 mb-5">
              <span className="w-7 h-7 rounded-full bg-violet-400 text-violet-900 font-black text-xs flex items-center justify-center shrink-0">3</span>
              <span className="text-xs font-black uppercase tracking-widest text-violet-300">Fueling</span>
            </div>
            <h3 className="text-xl font-black mb-2">Fuel your performance with precision</h3>
            <p className="text-sm opacity-60 mb-5">
              Race nutrition built on your actual metabolism — not population averages.
            </p>
            <ul className="space-y-2 text-sm opacity-80 mb-6 flex-1">
              {[
                'CHO demand at race intensity',
                'Substrate oxidation curves',
                'Glucose–fructose strategy',
                'Complete race fueling plan',
              ].map(f => (
                <li key={f} className="flex items-center gap-2">
                  <span className="text-violet-300 shrink-0">✓</span> {f}
                </li>
              ))}
            </ul>
            <p className="text-xs opacity-50 italic mb-5">
              "Fuel the work your body actually requires"
            </p>
            <p className="text-xs font-bold text-amber-300 uppercase tracking-wider mb-2">
              Available with Pro
            </p>
            <Link
              href="/pricing"
              className="block text-center py-3 bg-white/20 border border-white/30 text-white font-bold rounded-xl hover:bg-white/30 transition"
            >
              Included with Pro →
            </Link>
          </div>

        </div>
      </section>

      {/* ── Connection ────────────────────────────────────────────────── */}
      <section className="px-8 py-20 border-t border-white/10">
        <div className="max-w-3xl mx-auto text-center">

          <p className="text-xs font-black uppercase tracking-widest text-violet-400 mb-4">Why it matters</p>
          <h2 className="text-3xl font-black mb-10">Your physiology determines everything</h2>

          <div className="grid md:grid-cols-3 gap-6 text-left mb-10">
            {[
              { label: 'Training',  body: 'Your zones define which energy systems you develop — and which you leave undertrained.' },
              { label: 'Pacing',    body: 'Your thresholds define the intensity you can actually sustain across hours of racing.' },
              { label: 'Fueling',   body: 'Your metabolism defines how much carbohydrate you burn — and how much you need to take in.' },
            ].map(item => (
              <div key={item.label} className="bg-white/10 rounded-xl p-5">
                <p className="text-xs font-black uppercase tracking-wider text-violet-300 mb-2">{item.label}</p>
                <p className="text-sm opacity-70 leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>

          <p className="text-base font-bold opacity-60 italic">
            "When these align, performance follows."
          </p>
        </div>
      </section>

      {/* ── Race Execution ────────────────────────────────────────────── */}
      <section className="px-8 py-20 border-t border-white/10">
        <div className="max-w-4xl mx-auto">

          <div className="text-center mb-10">
            <p className="text-xs font-black uppercase tracking-widest text-violet-400 mb-3">Race day</p>
            <h2 className="text-3xl font-black">Turn insight into race-day performance</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-4 mb-10">
            {[
              { heading: 'Pace to your physiology',   body: 'Hold power based on LT2 — the intensity you can actually sustain, not an arbitrary percentage of FTP.' },
              { heading: 'Fuel the real demand',       body: 'Feed the carbohydrate your body actually burns at race intensity, not a generic sports-nutrition rule.' },
              { heading: 'Avoid the two big mistakes', body: 'Overpacing and underfueling compound each other. Getting both right is what separates good days from great ones.' },
            ].map(item => (
              <div key={item.heading} className="bg-white/10 rounded-xl p-5">
                <p className="text-sm font-black mb-2">{item.heading}</p>
                <p className="text-xs opacity-60 leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>

          <p className="text-center text-base font-bold opacity-60 italic mb-10">
            "Execute your race with confidence."
          </p>

          <div className="flex justify-center">
            <Link
              href="/calculator/profiler"
              className="px-8 py-4 bg-white text-violet-900 font-black rounded-2xl text-base hover:bg-violet-100 transition shadow-xl"
            >
              Start with a free profile →
            </Link>
          </div>
        </div>
      </section>

      {/* ── Trust ─────────────────────────────────────────────────────── */}
      <div className="py-8 text-center border-t border-white/10">
        <p className="text-xs opacity-30">
          Physiology-driven model · Validated against leading metabolic systems
          {' · '}
          <Link href="/support" className="hover:opacity-60 transition underline underline-offset-2">Support</Link>
        </p>
      </div>

    </main>
  );
}
