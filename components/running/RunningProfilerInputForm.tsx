'use client';

import { useState, useCallback } from 'react';
import { SPRINT_TIME_S } from '@/lib/engine/runningMetabolicEngine';

export interface RunningProfilerFormPayload {
  sprintDistanceM:   number;
  threeMinDistanceM: number;
  sixMinDistanceM:   number;
  massKg:            number;
  bodyFatPct:        number;
  sex?:              'Male' | 'Female';
  name?:             string;
}

export interface RunningProfilerFormPrefill {
  sprintDistanceM?:   number;
  threeMinDistanceM?: number;
  sixMinDistanceM?:   number;
  massKg?:            number;
  bodyFatPct?:        number;
  sex?:               'Male' | 'Female';
  name?:              string;
}

interface Props {
  onSubmit: (payload: RunningProfilerFormPayload) => void;
  loading:  boolean;
  error:    string | null;
  prefill?: RunningProfilerFormPrefill;
}

// ── Pace/distance conversion helpers ─────────────────────────────────────────

// Parse "mm:ss" or "m:ss" or plain "m.d" (decimal minutes) → seconds per km.
// Returns null if unparseable.
function parsePaceInput(s: string): number | null {
  const str = s.trim();
  if (!str) return null;
  const colonIdx = str.indexOf(':');
  if (colonIdx === -1) {
    const mins = parseFloat(str);
    if (!isFinite(mins) || mins <= 0) return null;
    return mins * 60;
  }
  const mins = parseInt(str.slice(0, colonIdx), 10);
  const secs = parseInt(str.slice(colonIdx + 1), 10);
  if (!isFinite(mins) || !isFinite(secs) || mins < 0 || secs < 0 || secs >= 60) return null;
  return mins * 60 + secs;
}

// Distance + duration → "m:ss" pace string for display in hints and pace inputs
function paceString(distM: number, durationS: number): string {
  if (!distM || distM <= 0 || durationS <= 0) return '';
  const secPerKm = (durationS / distM) * 1000;
  const mins = Math.floor(secPerKm / 60);
  const secs = Math.round(secPerKm % 60);
  if (secs === 60) return `${mins + 1}:00`;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

// Pace (sec/km) + duration → distance in metres
function paceToDistM(secPerKm: number, durationS: number): number {
  return Math.round((1000 / secPerKm) * durationS);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function RunningProfilerInputForm({ onSubmit, loading, error, prefill }: Props) {
  const [sex,       setSex]       = useState<'Male' | 'Female'>(prefill?.sex ?? 'Male');
  const [inputMode, setInputMode] = useState<'distance' | 'pace'>('distance');
  const [paceError, setPaceError] = useState<string | null>(null);

  // Distance mode state — controlled so live preview updates
  const [sprintDist, setSprintDist] = useState(prefill?.sprintDistanceM?.toString() ?? '');
  const [threeDist,  setThreeDist]  = useState(prefill?.threeMinDistanceM?.toString() ?? '');
  const [sixDist,    setSixDist]    = useState(prefill?.sixMinDistanceM?.toString() ?? '');

  // Pace mode state — controlled text inputs ("m:ss")
  const [sprintPace, setSprintPace] = useState(
    prefill?.sprintDistanceM ? paceString(prefill.sprintDistanceM, SPRINT_TIME_S) : '',
  );
  const [threePace, setThreePace] = useState(
    prefill?.threeMinDistanceM ? paceString(prefill.threeMinDistanceM, 180) : '',
  );
  const [sixPace, setSixPace] = useState(
    prefill?.sixMinDistanceM ? paceString(prefill.sixMinDistanceM, 360) : '',
  );

  // ── Mode switching — bidirectional conversion ─────────────────────────────

  function switchToPace() {
    // Convert current distance values → pace strings
    const sp = parseFloat(sprintDist);
    const th = parseFloat(threeDist);
    const si = parseFloat(sixDist);
    if (sp > 0) setSprintPace(paceString(sp, SPRINT_TIME_S));
    if (th > 0) setThreePace(paceString(th, 180));
    if (si > 0) setSixPace(paceString(si, 360));
    setPaceError(null);
    setInputMode('pace');
  }

  function switchToDistance() {
    // Convert current pace strings → distances (silently; invalid → keep current)
    const sp = parsePaceInput(sprintPace);
    const th = parsePaceInput(threePace);
    const si = parsePaceInput(sixPace);
    if (sp) setSprintDist(paceToDistM(sp, SPRINT_TIME_S).toString());
    if (th) setThreeDist(paceToDistM(th, 180).toString());
    if (si) setSixDist(paceToDistM(si, 360).toString());
    setPaceError(null);
    setInputMode('distance');
  }

  // ── Live hints (opposite of input mode) ──────────────────────────────────

  // Distance mode: show computed pace
  const sprintPaceHint = paceString(parseFloat(sprintDist), SPRINT_TIME_S);
  const threePaceHint  = paceString(parseFloat(threeDist),  180);
  const sixPaceHint    = paceString(parseFloat(sixDist),    360);

  // Pace mode: show computed distance
  function distHint(paceStr: string, durationS: number): string {
    const sec = parsePaceInput(paceStr);
    if (!sec) return '';
    return `≈ ${paceToDistM(sec, durationS)} m`;
  }

  // ── Form submission ──────────────────────────────────────────────────────

  const handleSubmit = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    let sprintDistanceM:   number;
    let threeMinDistanceM: number;
    let sixMinDistanceM:   number;

    if (inputMode === 'distance') {
      sprintDistanceM   = parseFloat(fd.get('sprintDistanceM')   as string);
      threeMinDistanceM = parseFloat(fd.get('threeMinDistanceM') as string);
      sixMinDistanceM   = parseFloat(fd.get('sixMinDistanceM')   as string);
    } else {
      // Pace mode — convert inputs to distances
      const sp = parsePaceInput(sprintPace);
      const th = parsePaceInput(threePace);
      const si = parsePaceInput(sixPace);

      if (!sp || !th || !si) {
        setPaceError('Enter all three paces as m:ss (e.g. 3:00)');
        return;
      }
      sprintDistanceM   = paceToDistM(sp, SPRINT_TIME_S);
      threeMinDistanceM = paceToDistM(th, 180);
      sixMinDistanceM   = paceToDistM(si, 360);
    }

    const rawName = (fd.get('name') as string)?.trim();
    onSubmit({
      sprintDistanceM,
      threeMinDistanceM,
      sixMinDistanceM,
      massKg:     parseFloat(fd.get('massKg')     as string),
      bodyFatPct: parseFloat(fd.get('bodyFatPct') as string),
      sex,
      name: rawName || undefined,
    });
  }, [sex, inputMode, sprintPace, threePace, sixPace, onSubmit]);

  const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500';
  const labelCls = 'block text-xs font-semibold text-gray-600 mb-1';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {/* Athlete context */}
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Athlete</p>
        <div className="space-y-2">
          <div>
            <label className={labelCls}>Name / ID (optional)</label>
            <input name="name" type="text" className={inputCls} placeholder="e.g. Jane Smith" defaultValue={prefill?.name ?? ''} />
          </div>
          <div>
            <label className={labelCls}>Sex</label>
            <div className="flex gap-2">
              {(['Male', 'Female'] as const).map(s => (
                <button key={s} type="button" onClick={() => setSex(s)}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition ${
                    sex === s
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-400'
                  }`}
                >{s}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <hr className="border-gray-100" />

      {/* Body composition */}
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Body Composition</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>Body mass (kg)</label>
            <input name="massKg" type="number" step="0.1" min={30} max={250} required className={inputCls} placeholder="70" defaultValue={prefill?.massKg ?? ''} />
          </div>
          <div>
            <label className={labelCls}>Body fat (%)</label>
            <input name="bodyFatPct" type="number" step="0.1" min={3} max={50} required className={inputCls} placeholder="15" defaultValue={prefill?.bodyFatPct ?? ''} />
          </div>
        </div>
      </div>

      <hr className="border-gray-100" />

      {/* Field tests */}
      <div>
        {/* Header + mode toggle */}
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Field Tests</p>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-semibold">
            <button
              type="button"
              onClick={switchToDistance}
              className={`px-3 py-1 transition ${
                inputMode === 'distance'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              Distance
            </button>
            <button
              type="button"
              onClick={switchToPace}
              className={`px-3 py-1 transition border-l border-gray-200 ${
                inputMode === 'pace'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              Pace
            </button>
          </div>
        </div>

        <p className="text-xs text-gray-400 mb-3">
          {inputMode === 'distance'
            ? 'Enter distance covered in each test'
            : 'Enter average pace for each test (mm:ss per km)'}
        </p>

        {/* Sprint test */}
        <div className="mb-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
          <p className="text-xs font-semibold text-gray-700 mb-0.5">20-second all-out sprint</p>
          <p className="text-xs text-gray-400 mb-2">Duration fixed at 20 s</p>

          {inputMode === 'distance' ? (
            <>
              <label className={labelCls}>Distance (m)</label>
              <input
                name="sprintDistanceM"
                type="number" step="1" min={20} max={400} required
                className={inputCls} placeholder="110"
                value={sprintDist} onChange={e => setSprintDist(e.target.value)}
              />
              {sprintPaceHint && (
                <p className="text-xs text-emerald-600 mt-1 font-medium">→ {sprintPaceHint}</p>
              )}
            </>
          ) : (
            <>
              <label className={labelCls}>Pace (min/km)</label>
              <input
                type="text" inputMode="numeric"
                className={inputCls} placeholder="2:47"
                value={sprintPace} onChange={e => { setSprintPace(e.target.value); setPaceError(null); }}
              />
              {distHint(sprintPace, SPRINT_TIME_S) && (
                <p className="text-xs text-emerald-600 mt-1 font-medium">{distHint(sprintPace, SPRINT_TIME_S)}</p>
              )}
            </>
          )}
        </div>

        {/* 3-min test */}
        <div className="mb-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
          <p className="text-xs font-semibold text-gray-700 mb-2">3-minute all-out test (180 s fixed)</p>

          {inputMode === 'distance' ? (
            <>
              <label className={labelCls}>Distance (m)</label>
              <input
                name="threeMinDistanceM"
                type="number" step="1" min={100} max={2500} required
                className={inputCls} placeholder="900"
                value={threeDist} onChange={e => setThreeDist(e.target.value)}
              />
              {threePaceHint && (
                <p className="text-xs text-emerald-600 mt-1 font-medium">→ {threePaceHint}</p>
              )}
            </>
          ) : (
            <>
              <label className={labelCls}>Pace (min/km)</label>
              <input
                type="text" inputMode="numeric"
                className={inputCls} placeholder="3:00"
                value={threePace} onChange={e => { setThreePace(e.target.value); setPaceError(null); }}
              />
              {distHint(threePace, 180) && (
                <p className="text-xs text-emerald-600 mt-1 font-medium">{distHint(threePace, 180)}</p>
              )}
            </>
          )}
        </div>

        {/* 6-min test */}
        <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
          <p className="text-xs font-semibold text-gray-700 mb-2">6-minute all-out test (360 s fixed)</p>

          {inputMode === 'distance' ? (
            <>
              <label className={labelCls}>Distance (m)</label>
              <input
                name="sixMinDistanceM"
                type="number" step="1" min={200} max={4000} required
                className={inputCls} placeholder="1700"
                value={sixDist} onChange={e => setSixDist(e.target.value)}
              />
              {sixPaceHint && (
                <p className="text-xs text-emerald-600 mt-1 font-medium">→ {sixPaceHint}</p>
              )}
            </>
          ) : (
            <>
              <label className={labelCls}>Pace (min/km)</label>
              <input
                type="text" inputMode="numeric"
                className={inputCls} placeholder="4:00"
                value={sixPace} onChange={e => { setSixPace(e.target.value); setPaceError(null); }}
              />
              {distHint(sixPace, 360) && (
                <p className="text-xs text-emerald-600 mt-1 font-medium">{distHint(sixPace, 360)}</p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Pace parse error */}
      {paceError && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-xs text-amber-700 font-medium">{paceError}</p>
        </div>
      )}

      {/* API / validation error */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-xs text-red-700 font-medium">{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold rounded-xl text-sm hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2 disabled:cursor-not-allowed"
      >
        {loading ? 'Calculating…' : 'Calculate Running Profile'}
      </button>

    </form>
  );
}
