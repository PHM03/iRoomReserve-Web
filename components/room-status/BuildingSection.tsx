'use client';

import FloorAccordion from '@/components/room-status/FloorAccordion';
import RoomList from '@/components/room-status/RoomList';
import type { BuildingOption, FloorGroup } from '@/lib/roomStatusView';

interface BuildingSectionProps {
  building: BuildingOption;
  floors: FloorGroup[];
}

export default function BuildingSection({
  building,
  floors,
}: BuildingSectionProps) {
  return (
    <section className="glass-card p-4 sm:p-5">
      <div className="mb-4">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/35">
          Building
        </p>
        <h3 className="text-xl font-bold text-white mt-2">{building.label}</h3>
        <p className="text-sm text-white/40 mt-1">{building.description}</p>
      </div>

      {floors.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-white/40">
          No rooms are configured for this building yet.
        </div>
      ) : (
        <div className="space-y-3">
          {floors.map((floorGroup) => {
            return (
              <FloorAccordion
                key={`${building.buildingId}:${floorGroup.id}`}
                floor={floorGroup.label}
                roomCount={floorGroup.rooms.length}
                renderContent={() => <RoomList items={floorGroup.rooms} />}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
