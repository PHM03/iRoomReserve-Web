'use client';

import type { ReactNode } from 'react';

import { getManagedBuildingOptionLabel } from '@/hooks/useAdminStatusPages';

interface AdminPageHeaderProps {
  title: string;
  description: ReactNode;
  managedBuildings: { id: string; name: string }[];
  buildingId?: string;
  buildingName?: string;
  activeBuildingLabel: string;
  onBuildingChange: (buildingId: string) => void;
}

export default function AdminPageHeader({
  title,
  description,
  managedBuildings,
  buildingId,
  buildingName,
  activeBuildingLabel,
  onBuildingChange,
}: Readonly<AdminPageHeaderProps>) {
  return (
    <section className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
      <div className="bg-white rounded-xl px-6 py-4 border border-white/30">
        <h2 className="text-2xl font-bold text-gray-800">{title}</h2>
        <div className="mt-2 text-sm text-gray-600">{description}</div>
      </div>

      <div className="w-full max-w-sm rounded-2xl border border-[#d9a3a4] bg-[#f9eded] p-4">
        <p className="text-[11px] font-bold uppercase tracking-wide text-black">
          Active Building
        </p>
        {managedBuildings.length > 1 ? (
          <select
            value={buildingId ?? ''}
            onChange={(event) => onBuildingChange(event.target.value)}
            className="glass-input mt-3 w-full px-4 py-3 bg-dark/6 appearance-none cursor-pointer"
            style={{ backgroundImage: 'none' }}
          >
            {managedBuildings.map((building) => (
              <option key={building.id} value={building.id}>
                {getManagedBuildingOptionLabel(building)}
              </option>
            ))}
          </select>
        ) : (
          <>
            <p className="mt-1 text-sm font-bold text-black">{activeBuildingLabel}</p>
            {buildingName && activeBuildingLabel !== buildingName ? (
              <p className="mt-1 text-xs text-black">{buildingName}</p>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
