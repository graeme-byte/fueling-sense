'use client';

import Link from 'next/link';

interface Props {
  active: 'profiler' | 'fueling';
}

export default function ToolSwitcher({ active }: Props) {
  return (
    <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
      <Link
        href="/calculator/profiler"
        className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-all whitespace-nowrap ${
          active === 'profiler'
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        Power Profiler
      </Link>
      <Link
        href="/calculator/fueling"
        className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-all whitespace-nowrap ${
          active === 'fueling'
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        Fueling Sense
      </Link>
    </div>
  );
}
