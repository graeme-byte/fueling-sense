'use client';

import { Fragment } from 'react';
import Link from 'next/link';

type Tool = 'cycling-profiler' | 'cycling-fueling' | 'running-profiler' | 'running-fueling';

interface Props {
  active: Tool;
}

const TOOLS = [
  { key: 'cycling-profiler' as Tool, label: 'Cycling Profiler', href: '/calculator/profiler' },
  { key: 'cycling-fueling'  as Tool, label: 'Cycling Fueling',  href: '/calculator/fueling' },
  { key: 'running-profiler' as Tool, label: 'Running Profiler', href: '/calculator/running-profiler' },
  { key: 'running-fueling'  as Tool, label: 'Running Fueling',  href: '/calculator/running-fueling' },
] as const;

export default function AllToolsSwitcher({ active }: Props) {
  return (
    <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
      {TOOLS.map((tool, i) => (
        <Fragment key={tool.key}>
          {i === 2 && <span className="mx-1 w-px h-4 bg-gray-300 shrink-0" />}
          <Link
            href={tool.href}
            className={`text-xs font-semibold px-2.5 py-1.5 rounded-md transition-all whitespace-nowrap ${
              active === tool.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tool.label}
          </Link>
        </Fragment>
      ))}
    </div>
  );
}
