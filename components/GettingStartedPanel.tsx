'use client';

import { useState, useEffect, useRef } from 'react';

const LS_KEY = 'fuelingSense.hideGettingStarted';

interface Props {
  context: 'profiler' | 'fueling';
  isProUser: boolean;
}

export default function GettingStartedPanel({ context, isProUser }: Props) {
  // Start hidden to avoid a flash before localStorage is read.
  const [hidden,           setHidden]           = useState(true);
  const [showInstructions, setShowInstructions] = useState(false);
  const instructionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHidden(localStorage.getItem(LS_KEY) === 'true');
  }, []);

  function dismiss() {
    localStorage.setItem(LS_KEY, 'true');
    setHidden(true);
  }

  function show() {
    localStorage.removeItem(LS_KEY);
    setHidden(false);
    setShowInstructions(false);
  }

  function toggleInstructions() {
    if (showInstructions) {
      setShowInstructions(false);
    } else {
      setShowInstructions(true);
      // Defer scroll until after the instructions section is in the DOM.
      requestAnimationFrame(() => {
        instructionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }
  }

  // ── Permanently dismissed ─────────────────────────────────────────
  if (hidden) {
    return (
      <div className="flex justify-end mb-3">
        <button
          onClick={show}
          className="text-xs text-gray-400 hover:text-gray-600 transition underline underline-offset-2"
        >
          Show Getting Started
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm mb-4 overflow-hidden">

      {/* ── Welcome section — always visible ─────────────────────── */}
      <div className="px-4 py-4">
        <div className="flex items-start justify-between gap-4 mb-3">
          <p className="text-sm font-bold text-gray-800">
            {isProUser ? 'Welcome to Fueling Sense PRO' : 'Welcome to Fueling Sense'}
          </p>
          <button
            onClick={dismiss}
            className="text-xs text-gray-400 hover:text-gray-600 transition underline underline-offset-2 shrink-0"
          >
            Hide for now
          </button>
        </div>

        <div className="space-y-2 text-xs text-gray-600 leading-relaxed">
          {isProUser && <p>Congratulations on upgrading.</p>}
          <p>
            You&apos;re now a few steps away from building a personalised race fueling and pacing strategy
            based on your physiology — not guesswork.
          </p>
          <p>
            This tool will help you understand how your body produces energy, how that changes with
            intensity, and how to fuel correctly for your target race demands.
          </p>
          <p>
            <strong>DATA QUALITY MATTERS.</strong>{' '}
            Small errors in your inputs can lead to large errors in your fueling strategy.{' '}
            Take a few minutes to read our advice on data collection and entry before you start.
          </p>
        </div>

        <button
          onClick={toggleInstructions}
          className="mt-3 text-xs font-semibold text-violet-600 hover:text-violet-800 transition"
        >
          {showInstructions ? 'Read less ↑' : 'Read more →'}
        </button>
      </div>

      {/* ── Instructions section — collapsed by default ───────────── */}
      {showInstructions && (
        <div
          ref={instructionsRef}
          className="border-t border-gray-100 px-4 py-4 space-y-3"
        >

          {/* ── Power inputs ─────────────────────────────────────────── */}
          <div>
            <p className="text-xs font-bold text-gray-800 mb-2">Getting started with power inputs</p>
            <p className="text-xs text-gray-600 mb-1">To begin, you only need two efforts:</p>
            <ul className="text-xs text-gray-600 space-y-0.5 list-disc list-inside mb-3">
              <li>20-second max power (P20)</li>
              <li>5-minute max power (P300)</li>
            </ul>

            <p className="text-xs font-semibold text-gray-700 mb-1">Quick start</p>
            <p className="text-xs text-gray-600 mb-1">Start with your current power profile. Use your best recent efforts from:</p>
            <ul className="text-xs text-gray-600 space-y-0.5 list-disc list-inside mb-1">
              <li>TrainingPeaks</li>
              <li>WKO</li>
              <li>Zwift</li>
              <li>Strava</li>
            </ul>
            <p className="text-xs text-gray-600 mb-3">If you&apos;ve trained or raced recently, you likely already have usable data.</p>

            <p className="text-xs font-semibold text-gray-700 mb-1">Improve accuracy</p>
            <p className="text-xs text-gray-600 mb-1">For better results:</p>
            <ul className="text-xs text-gray-600 space-y-0.5 list-disc list-inside mb-1">
              <li>Use efforts from the last 2–4 weeks</li>
              <li>Ensure they were maximal and uninterrupted</li>
              <li>Avoid: fatigued sessions, pacing errors, interruptions (traffic, terrain changes)</li>
            </ul>
            <p className="text-xs text-gray-600 mb-1">These inputs directly drive:</p>
            <ul className="text-xs text-gray-600 space-y-0.5 list-disc list-inside mb-3">
              <li>VLamax (from P20)</li>
              <li>VO₂max and thresholds (from P300)</li>
            </ul>

            <p className="text-xs font-semibold text-gray-700 mb-1">Recommended testing protocol (optional)</p>

            <p className="text-xs font-medium text-gray-700 mt-2 mb-0.5">Warm-up</p>
            <ul className="text-xs text-gray-600 space-y-0.5 list-disc list-inside mb-2">
              <li>15 minutes easy riding</li>
              <li>1 short sprint (~8 seconds, high but not maximal)</li>
              <li>8 minutes easy recovery</li>
            </ul>

            <p className="text-xs font-medium text-gray-700 mb-0.5">Test set</p>
            <p className="text-xs text-gray-600 mb-0.5">Sprint efforts (P20):</p>
            <ul className="text-xs text-gray-600 space-y-0.5 list-disc list-inside mb-2">
              <li>2 × 20 seconds all-out (seated)</li>
              <li>2 minutes complete rest before each effort</li>
              <li>No pacing — go all-out</li>
              <li>5–15 minutes recovery between efforts</li>
            </ul>
            <p className="text-xs text-gray-600 mb-0.5">Aerobic effort (P300):</p>
            <ul className="text-xs text-gray-600 space-y-0.5 list-disc list-inside mb-2">
              <li>1 × 5 minutes all-out (seated)</li>
              <li>Start controlled → finish maximal</li>
              <li>No interruptions</li>
            </ul>

            <p className="text-xs font-medium text-gray-700 mb-0.5">Key guidance</p>
            <ul className="text-xs text-gray-600 space-y-0.5 list-disc list-inside">
              <li>Use flat terrain or a steady climb</li>
              <li>Avoid stops, traffic, or drafting</li>
              <li>Keep your head unit running</li>
              <li>Fuel normally (do not test depleted)</li>
            </ul>
          </div>

          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs font-semibold text-gray-700 mb-1">Why body weight &amp; body fat matter</p>
            <p className="text-xs text-gray-600">
              These values are used to estimate fat-free mass, which influences model outputs such as substrate utilisation, VLamax estimation, and fueling recommendations.
            </p>
            <p className="text-xs text-gray-600 mt-1">
              Small errors in body fat can meaningfully affect carbohydrate demand and gap analysis.
            </p>
          </div>

          <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
            <li>Underestimating body fat increases estimated fat-free mass and tends to suppress VLamax within the model.</li>
            <li>Overestimating body fat reduces fat-free mass and tends to inflate VLamax.</li>
            <li>Consistency matters if comparing scenarios over time.</li>
          </ul>

          <div>
            <p className="text-xs font-semibold text-gray-700 mb-1">Recommended measurement methods</p>
            <p className="text-xs text-gray-600">
              Realistically, a good quality smart scale is perfectly acceptable — especially if used consistently under the same conditions.
            </p>
            <p className="text-xs text-gray-600 mt-1">
              Skinfold measurements provide a more accurate field method when performed correctly.
            </p>
            <p className="text-xs text-gray-600 mt-1">
              DEXA is considered the gold standard, but is not necessary for most users.
            </p>
          </div>

          <p className="text-xs text-gray-500">
            You are not paying per run, so you can experiment with different values and refine your inputs over time to better understand your profile.
          </p>
        </div>
      )}
    </div>
  );
}
