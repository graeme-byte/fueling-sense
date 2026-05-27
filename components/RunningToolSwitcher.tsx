'use client';

import Link from 'next/link';

interface Props {
  active: 'running-profiler' | 'running-fueling';
}

export default function RunningToolSwitcher({ active }: Props) {
  return (
    <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
      <Link
        href="/calculator/running-profiler"
        className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-all whitespace-nowrap ${
          active === 'running-profiler'
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        Running Profiler
      </Link>
      <Link
        href="/calculator/running-fueling"
        className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-all whitespace-nowrap ${
          active === 'running-fueling'
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        Running Fueling
      </Link>
    </div>
  );
}
