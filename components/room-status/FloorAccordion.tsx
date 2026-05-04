'use client';

import { useState, type ReactNode } from 'react';

interface FloorAccordionProps {
  floor: string;
  roomCount: number;
  renderContent: () => ReactNode;
}

export default function FloorAccordion({
  floor,
  roomCount,
  renderContent,
}: Readonly<FloorAccordionProps>) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <section className="glass-card overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen((previous) => !previous)}
        className="w-full px-5 py-4 text-left flex items-center justify-between gap-4 hover:bg-primary/10 transition-colors"
      >
        <div>
          <h3 className="text-base font-bold text-black">{floor}</h3>
          <p className="text-sm text-black mt-1">
            {roomCount} room{roomCount === 1 ? '' : 's'}
          </p>
        </div>

        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-dark/10 bg-dark/5 text-black">
          <svg
            className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </span>
      </button>

      {isOpen ? <div className="px-5 pb-5">{renderContent()}</div> : null}
    </section>
  );
}
