/**
 * zoneDefinitions.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared zone metadata — colours, dot indicators, and tooltip content.
 *
 * Imported by the bike profiler (ProfilerResultsV06.tsx) and the running
 * profiler zone table (RunningZonesTable.tsx). The physiology is identical
 * across disciplines; only the intensity unit differs.
 *
 * Do not put computation or engine logic here — constants only.
 */

export interface ZoneInfoContent {
  purpose:    string;
  physiology: string;
  bestFor:    string;
  note?:      string;
}

export const ZONE_INFO: Record<string, ZoneInfoContent> = {
  'Zone 1': {
    purpose:    'Active recovery and circulation',
    physiology: 'Well below LT1 — almost entirely aerobic fat oxidation, near-zero lactate. The nervous system recovers, not the muscles.',
    bestFor:    'Recovery days, warm-ups, cool-downs, easy filler between hard sessions.',
    note:       'If you can feel it working, it is not Zone 1.',
  },
  'Zone 2': {
    purpose:    'Build aerobic base and fat-oxidation capacity',
    physiology: 'Below LT1 — fat is the primary fuel. Lactate stays at baseline. This is where the highest proportion of energy comes from fat.',
    bestFor:    'Long sessions, base-building blocks, volume accumulation.',
    note:       'The most underused zone. The majority of an endurance athlete\'s training belongs here.',
  },
  'Zone 3A': {
    purpose:    'Aerobic efficiency at the threshold boundary',
    physiology: 'At or just above LT1 — carbohydrate contribution begins rising. Lactate edges above baseline but remains controlled and clearable.',
    bestFor:    'Focused endurance work, aerobic development sessions, progression that stays below tempo.',
  },
  'Zone 3B': {
    purpose:    'Muscular endurance and aerobic durability',
    physiology: 'Clearly above LT1, below LT2 — mixed fuel use, moderate and manageable lactate accumulation. Sustainable for 20–60 min.',
    bestFor:    'Tempo intervals, race-simulation pacing, threshold preparation.',
  },
  'Zone 4': {
    purpose:    'Work at maximal lactate steady state (LT2)',
    physiology: 'At LT2 — carbohydrate dominates. Lactate is at the highest level that can be sustained without progressive accumulation. This is the threshold.',
    bestFor:    'Threshold intervals (10–30 min), race-pace specificity for events lasting 40 min or more.',
  },
  'Zone 5A': {
    purpose:    'Entry into the severe domain — raise LT2 and tolerance to accumulation',
    physiology: 'Above LT2 — lactate rises progressively and oxygen uptake continues climbing toward VO2max. The body is working to clear accumulation, not just produce energy.',
    bestFor:    '5–12 min intervals just above threshold, forcing upward adaptation of LT2 over training blocks.',
    note:       'Often mislabelled as "threshold plus" — physiologically it is a distinct, harder domain.',
  },
  'Zone 5B': {
    purpose:    'Maximise oxygen uptake and aerobic ceiling',
    physiology: 'At 90–100% of vVO2max — carbohydrate fuels nearly all energy. VO2max is reached or closely approached within 3–5 min. Lactate accumulates rapidly.',
    bestFor:    '3–6 min VO2max intervals with structured recovery to drive aerobic ceiling adaptations.',
  },
  'Zone 6': {
    purpose:    'Anaerobic capacity and lactate tolerance',
    physiology: 'Above vVO2max — heavily reliant on anaerobic glycolysis. High VLamax demand. Lactate spikes rapidly. Not sustainable beyond 1–3 min.',
    bestFor:    'Anaerobic capacity repeats, race-winning surges, capacity work in periodised blocks.',
    note:       'High anaerobic training volume raises VLamax, which can suppress LT2 — use deliberately within a structured plan.',
  },
  'Zone 7': {
    purpose:    'Neuromuscular power and maximal sprint output',
    physiology: 'At or near sprint speed — maximal power driven by phosphocreatine and peak glycolytic rate. Duration measured in seconds. Central nervous system recruitment is at its ceiling.',
    bestFor:    'Sprint training, explosive starts, short maximal efforts under 15 seconds.',
    note:       'Neural adaptations from this zone do not require high volume — quality and full recovery between efforts matter most.',
  },
};

// Dot indicator colours — one per zone row
export const ZONE_DOT: Record<string, string> = {
  'Zone 1':  'bg-blue-200',
  'Zone 2':  'bg-blue-500',
  'Zone 3A': 'bg-green-300',
  'Zone 3B': 'bg-green-500',
  'Zone 4':  'bg-yellow-400',
  'Zone 5A': 'bg-orange-500',
  'Zone 5B': 'bg-red-500',
  'Zone 6':  'bg-red-700',
  'Zone 7':  'bg-violet-600',
};

// Row background — includes hover state
export const ZONE_ROW_BG: Record<string, string> = {
  'Zone 1':  'bg-blue-50   hover:bg-blue-100',
  'Zone 2':  'bg-blue-100  hover:bg-blue-200',
  'Zone 3A': 'bg-green-50  hover:bg-green-100',
  'Zone 3B': 'bg-green-100 hover:bg-green-200',
  'Zone 4':  'bg-yellow-50  hover:bg-yellow-100',
  'Zone 5A': 'bg-orange-50  hover:bg-orange-100',
  'Zone 5B': 'bg-red-50     hover:bg-red-100',
  'Zone 6':  'bg-red-100    hover:bg-red-200',
  'Zone 7':  'bg-violet-50  hover:bg-violet-100',
};
