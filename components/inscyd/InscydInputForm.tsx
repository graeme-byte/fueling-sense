'use client';

import { useInscydStore } from '@/lib/store/inscydStore';
import type { Inscyd4ptInputs } from '@/lib/types';

interface Props {
  onSubmit: (inputs: Inscyd4ptInputs) => void;
  loading:  boolean;
}

export default function InscydInputForm({ onSubmit, loading }: Props) {
  const { inputs, setInputs, error } = useInscydStore();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    const data: Inscyd4ptInputs = {
      name:     (fd.get('name') as string).trim() || 'Athlete',
      bodyMass: parseFloat(fd.get('bodyMass') as string),
      bodyFat:  parseFloat(fd.get('bodyFat')  as string),
      p20s:     parseFloat(fd.get('p20s')     as string),
      p180:     parseFloat(fd.get('p180')     as string),
      p360:     parseFloat(fd.get('p360')     as string),
      p720:     parseFloat(fd.get('p720')     as string),
    };
    onSubmit(data);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Athlete */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Athlete</p>
        <input
          name="name"
          type="text"
          placeholder="Name / ID"
          defaultValue={inputs.name}
          onChange={e => setInputs({ name: e.target.value })}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
      </div>

      {/* Body composition */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Body Composition</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Body Mass (kg) *</label>
            <input
              name="bodyMass"
              type="number"
              required min={30} max={250} step={0.5}
              defaultValue={inputs.bodyMass}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Body Fat (%) *</label>
            <input
              name="bodyFat"
              type="number"
              required min={3} max={50} step={0.5}
              defaultValue={inputs.bodyFat}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
        </div>
      </div>

      {/* Power efforts */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Power Efforts</p>
        <div className="space-y-2">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">P20s — 20-sec sprint (W) *</label>
            <input
              name="p20s"
              type="number"
              required min={50} max={3000} step="any"
              defaultValue={inputs.p20s}
              placeholder="e.g. 950"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
            <p className="text-xs text-gray-400 mt-0.5">Mean 20-second all-out power</p>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">P180 — 3-min all-out (W) *</label>
            <input
              name="p180"
              type="number"
              required min={50} max={1500} step="any"
              defaultValue={inputs.p180}
              placeholder="e.g. 430"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
            <p className="text-xs text-gray-400 mt-0.5">3-minute average power</p>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">P360 — 6-min all-out (W) *</label>
            <input
              name="p360"
              type="number"
              required min={50} max={1200} step="any"
              defaultValue={inputs.p360}
              placeholder="e.g. 375"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
            <p className="text-xs text-gray-400 mt-0.5">6-minute average power</p>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">P720 — 12-min all-out (W) *</label>
            <input
              name="p720"
              type="number"
              required min={50} max={1000} step="any"
              defaultValue={inputs.p720}
              placeholder="e.g. 320"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
            <p className="text-xs text-gray-400 mt-0.5">12-minute average power</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 bg-gradient-to-r from-violet-600 to-blue-600 text-white font-bold rounded-xl text-sm hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
            Calculating…
          </>
        ) : (
          '▶ Calculate Profile'
        )}
      </button>

    </form>
  );
}
