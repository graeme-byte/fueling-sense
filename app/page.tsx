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
          A structured field test — on the bike or on foot, no account needed. Estimate your
          metabolic profile. Turn it into sport-specific training zones, substrate utilisation
          models, and race-day fueling strategy.
        </p>

        <div className="relative z-20 flex gap-4 flex-wrap justify-center">
          <Link
            href="/calculator/profiler"
            className="px-8 py-4 bg-white text-violet-900 font-black rounded-2xl text-base hover:bg-violet-100 transition shadow-xl"
          >
            Cycling Profiler →
          </Link>
          <Link
            href="/calculator/running-profiler"
            className="px-8 py-4 bg-white/10 border border-white/20 font-bold rounded-2xl text-base hover:bg-white/20 transition"
          >
            Running Profiler →
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

          {/* Step 1 — Profile */}
          <div className="bg-white/10 backdrop-blur border border-white/20 rounded-2xl p-8 flex flex-col">
            <div className="flex items-center gap-3 mb-5">
              <span className="w-7 h-7 rounded-full bg-green-400 text-green-900 font-black text-xs flex items-center justify-center shrink-0">1</span>
              <span className="text-xs font-black uppercase tracking-widest text-green-400">Profile</span>
            </div>
            <h3 className="text-xl font-black mb-2">Estimate your metabolic profile</h3>
            <p className="text-sm opacity-60 mb-5">
              A short, structured field test. Estimate your metabolic fingerprint — for cycling or running.
            </p>
            <ul className="space-y-2 text-sm opacity-80 mb-6 flex-1">
              {['VO2max (ml/kg/min)', 'VLamax (mmol/L/s)', 'Metabolic thresholds (LT1 · LT2)', 'Personalised training zones'].map(f => (
                <li key={f} className="flex items-center gap-2">
                  <span className="text-green-400 shrink-0">✓</span> {f}
                </li>
              ))}
            </ul>
            <p className="text-xs opacity-50 italic mb-5">
              "Understand what your engine can produce"
            </p>
            <div className="flex flex-col gap-2">
              <Link
                href="/calculator/profiler"
                className="block text-center py-2.5 bg-white text-violet-900 font-bold rounded-xl hover:bg-violet-100 transition"
              >
                Cycling Profiler →
              </Link>
              <Link
                href="/calculator/running-profiler"
                className="block text-center py-2.5 bg-white/10 border border-white/20 text-white font-semibold rounded-xl hover:bg-white/20 transition text-sm"
              >
                Running Profiler →
              </Link>
            </div>
          </div>

          {/* Step 2 — Understand */}
          <div className="bg-gradient-to-br from-violet-600 to-blue-600 rounded-2xl p-8 shadow-2xl ring-2 ring-violet-300/30 flex flex-col">
            <div className="flex items-center gap-3 mb-5">
              <span className="w-7 h-7 rounded-full bg-white/20 text-white font-black text-xs flex items-center justify-center shrink-0">2</span>
              <span className="text-xs font-black uppercase tracking-widest text-violet-200">Understand</span>
            </div>
            <h3 className="text-xl font-black mb-2">See your physiology</h3>
            <p className="text-sm opacity-80 mb-5">
              Go beyond raw numbers. See where your aerobic and anaerobic thresholds actually sit.
            </p>
            <ul className="space-y-2 text-sm opacity-90 mb-6 flex-1">
              {[
                'LT1 — aerobic threshold',
                'LT2 — anaerobic threshold',
                'Personalised training zones',
                'Export your profile as a PDF',
              ].map(f => (
                <li key={f} className="flex items-center gap-2">
                  <span className="text-violet-200 shrink-0">✓</span> {f}
                </li>
              ))}
            </ul>
            <p className="text-xs opacity-60 italic mb-5">
              "Train with precision instead of guesswork"
            </p>
            <Link
              href="/calculator/profiler"
              className="block text-center py-3 bg-white text-violet-700 font-black rounded-xl hover:bg-violet-50 transition"
            >
              See your thresholds →
            </Link>
          </div>

          {/* Step 3 — Fueling */}
          <div className="bg-white/10 backdrop-blur border border-white/20 rounded-2xl p-8 flex flex-col">
            <div className="flex items-center gap-3 mb-5">
              <span className="w-7 h-7 rounded-full bg-blue-400 text-blue-900 font-black text-xs flex items-center justify-center shrink-0">3</span>
              <span className="text-xs font-black uppercase tracking-widest text-blue-300">Fuel</span>
            </div>
            <h3 className="text-xl font-black mb-2">Model your fueling strategy</h3>
            <p className="text-sm opacity-60 mb-5">
              Race nutrition modelled on your actual metabolism — for cycling and running. Not population averages.
            </p>
            <ul className="space-y-2 text-sm opacity-80 mb-6 flex-1">
              {[
                'CHO demand at race intensity',
                'Substrate utilisation curves',
                'Glucose–fructose strategy',
                'Complete race fueling plan',
              ].map(f => (
                <li key={f} className="flex items-center gap-2">
                  <span className="text-blue-300 shrink-0">✓</span> {f}
                </li>
              ))}
            </ul>
            <p className="text-xs opacity-50 italic mb-5">
              "Fuel the work your body actually requires"
            </p>
            <Link
              href="/calculator/fueling"
              className="block text-center py-3 bg-white/20 border border-white/30 text-white font-bold rounded-xl hover:bg-white/30 transition"
            >
              Open the fueling calculator →
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
              { label: 'Fueling',   body: 'Your metabolism defines how much carbohydrate you oxidise — and how much you need to take in.' },
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
              { heading: 'Pace to your threshold',     body: 'Hold intensity based on your lactate threshold — the effort you can actually sustain, derived from your own physiology.' },
              { heading: 'Model the real demand',       body: 'Estimate the carbohydrate your body oxidises at race intensity. Use that as the basis for your fueling strategy, not a generic rule.' },
              { heading: 'Avoid the two big mistakes', body: 'Overpacing and underfueling compound each other. Accurate models of both give you better decision support on race day.' },
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

          <div className="flex justify-center gap-4 flex-wrap">
            <Link
              href="/calculator/profiler"
              className="px-8 py-4 bg-white text-violet-900 font-black rounded-2xl text-base hover:bg-violet-100 transition shadow-xl"
            >
              Start with Cycling Profiler →
            </Link>
            <Link
              href="/calculator/running-profiler"
              className="px-8 py-4 bg-white/10 border border-white/20 font-bold rounded-2xl text-base hover:bg-white/20 transition"
            >
              Start with Running Profiler →
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
