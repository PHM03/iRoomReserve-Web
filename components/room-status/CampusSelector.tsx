'use client';

import type { ReservationCampus } from '@/lib/campuses';
import type { CampusOption } from '@/lib/roomStatusView';

interface CampusSelectorProps {
  onChange: (campus: ReservationCampus) => void;
  options: CampusOption[];
  value: ReservationCampus | '';
}

export default function CampusSelector({
  onChange,
  options,
  value,
}: CampusSelectorProps) {
  if (options.length === 0) {
    return null;
  }

  return (
    <section className="glass-card p-4 sm:p-5">
      <div className="mb-4">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/35">
          Campus
        </p>
        <h3 className="text-lg font-bold text-white mt-2">
          Start with a campus
        </h3>
        <p className="text-sm text-white/45 mt-1">
          Narrow the status board before selecting a building and floor.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((option) => {
          const isActive = option.id === value;

          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onChange(option.id)}
              className={`rounded-2xl border px-4 py-4 text-left transition-all ${
                isActive
                  ? 'border-primary/50 bg-primary/12 shadow-[0_12px_30px_rgba(161,33,36,0.18)]'
                  : 'border-white/10 bg-white/5 hover:bg-white/8 hover:border-white/20'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-white">{option.label}</p>
                  <p className="text-xs text-white/40 mt-1">
                    {option.description}
                  </p>
                </div>
                <span
                  className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                    isActive
                      ? 'border-primary/40 bg-primary/20 text-primary'
                      : 'border-white/10 bg-white/5 text-white/45'
                  }`}
                >
                  {option.buildings.length} building
                  {option.buildings.length === 1 ? '' : 's'}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
