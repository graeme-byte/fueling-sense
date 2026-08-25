import Link from 'next/link';

export default function HowItWorksPage() {
  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center px-6 py-20">

      {/* Header */}
      <div className="text-center mb-4">
        <p className="text-xs font-black uppercase tracking-widest text-violet-500 mb-3">How it works</p>
        <h1 className="text-4xl font-black text-gray-900 mb-3">
          One journey. Three steps.
        </h1>
        <p className="text-gray-500 max-w-xl mx-auto">
          Test your physiology, understand your thresholds, then fuel your races on your
          actual metabolism — not population averages. No account needed to start.
        </p>
      </div>

      {/* Progression label */}
      <div className="flex items-center gap-2 text-xs font-bold text-gray-400 mb-10">
        <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full">Measure</span>
        <span>→</span>
        <span className="bg-violet-100 text-violet-700 px-3 py-1 rounded-full">Understand</span>
        <span>→</span>
        <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full">Fuel</span>
      </div>

      <div className="grid md:grid-cols-3 gap-6 w-full max-w-4xl">

        {/* Step 1 */}
        <div className="bg-white rounded-2xl p-8 border border-gray-200 shadow-sm flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-6 h-6 rounded-full bg-green-100 text-green-700 font-black text-xs flex items-center justify-center shrink-0">1</span>
            <p className="text-xs font-black uppercase text-green-600 tracking-widest">Measure</p>
          </div>

          <h2 className="text-2xl font-black text-gray-900 mb-1">Measure your engine</h2>
          <p className="text-gray-400 text-sm mb-6">A short field test — on the bike or on foot</p>

          <ul className="space-y-2 text-sm text-gray-600 mb-6 flex-1">
            {[
              'Science-based metabolic profiler',
              'VO2max (ml/kg/min)',
              'VLamax (mmol/L/s)',
              'Critical Power + W\'',
              'Power–duration curve',
            ].map(f => (
              <li key={f} className="flex gap-2"><span className="text-green-500 shrink-0">✓</span>{f}</li>
            ))}
          </ul>

          <p className="text-xs text-gray-400 italic mb-6">"Understand what your engine can produce"</p>

          <Link
            href="/calculator/profiler"
            className="block text-center py-3 border border-gray-300 rounded-xl font-bold text-gray-700 hover:bg-gray-50 transition"
          >
            Cycling Profiler →
          </Link>
        </div>

        {/* Step 2 */}
        <div className="bg-gradient-to-br from-violet-600 to-blue-600 rounded-2xl p-8 text-white shadow-xl flex flex-col ring-2 ring-violet-300/30">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-6 h-6 rounded-full bg-white/20 text-white font-black text-xs flex items-center justify-center shrink-0">2</span>
            <p className="text-xs font-black uppercase tracking-widest text-violet-200">Understand</p>
          </div>

          <h2 className="text-2xl font-black mb-4">See your physiology</h2>

          <ul className="space-y-2 text-sm opacity-90 mb-6 flex-1">
            {[
              'LT1 — aerobic threshold (W)',
              'LT2 — anaerobic threshold (W)',
              'Full personalised training zones',
              'LT1/LT2 on your lactate curve',
              'Performance profile classification',
              'Export your full profile and training zones as a PDF',
            ].map(f => (
              <li key={f} className="flex gap-2"><span className="text-violet-200 shrink-0">✓</span>{f}</li>
            ))}
          </ul>

          <p className="text-xs opacity-60 italic mb-6">"Train with precision instead of guesswork"</p>

          <Link
            href="/calculator/profiler"
            className="block text-center py-3 bg-white text-violet-700 font-black rounded-xl hover:bg-violet-50 transition"
          >
            See your thresholds →
          </Link>
        </div>

        {/* Step 3 */}
        <div className="bg-white rounded-2xl p-8 border border-gray-200 shadow-sm flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-black text-xs flex items-center justify-center shrink-0">3</span>
            <p className="text-xs font-black uppercase text-blue-500 tracking-widest">Fuel</p>
          </div>

          <h2 className="text-2xl font-black text-gray-900 mb-1">Fuel your performance with precision</h2>
          <p className="text-gray-400 text-sm mt-3 mb-6">Built on your test results</p>

          <ul className="space-y-2 text-sm text-gray-500 mb-6 flex-1">
            {[
              'CHO demand at race intensity',
              'Substrate oxidation curves',
              'Glucose–fructose strategy',
              'Complete race fueling plan',
              'Auto-fill from your metabolic profile',
            ].map(f => (
              <li key={f} className="flex gap-2"><span className="text-blue-300 shrink-0">✓</span>{f}</li>
            ))}
          </ul>

          <p className="text-xs text-gray-400 italic mb-6">"Fuel the work your body actually requires"</p>

          <Link
            href="/calculator/fueling"
            className="block text-center py-3 border border-gray-300 rounded-xl font-bold text-gray-700 hover:bg-gray-50 transition"
          >
            Cycling Fueling →
          </Link>
        </div>

      </div>

      {/* Bottom link */}
      <p className="mt-12 text-sm text-gray-400">
        Ready to start?{' '}
        <Link href="/calculator/profiler" className="text-violet-600 font-semibold hover:underline">
          Go to the profiler →
        </Link>
      </p>

    </main>
  );
}
