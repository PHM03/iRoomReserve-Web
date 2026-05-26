'use client';

import type { ReactNode } from 'react';

import AdminBuildingSelect from '@/components/admin/AdminBuildingSelect';
import { getManagedBuildingOptionLabel } from '@/hooks/useAdminStatusPages';

interface AdminPageHeaderProps {
  title: string;
  description: ReactNode;
  managedBuildings: { id: string; name: string }[];
  buildingId?: string;
  buildingName?: string;
  activeBuildingLabel: string;
  onBuildingChange: (buildingId: string) => void;
  integratedBuildingField?: boolean;
}

export default function AdminPageHeader({
  title,
  description,
  managedBuildings,
  buildingId,
  buildingName,
  activeBuildingLabel,
  onBuildingChange,
  integratedBuildingField = false,
}: Readonly<AdminPageHeaderProps>) {
  if (integratedBuildingField) {
    return (
      <section className="relative z-[60] w-full rounded-2xl border border-white/35 bg-white/75 px-6 py-5 shadow-[0_24px_60px_rgba(15,23,42,0.17)] backdrop-blur-xl transition-all duration-300 hover:bg-white/85 hover:shadow-2xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">{title}</h2>
            <div className="mt-2 text-sm text-gray-600">{description}</div>
          </div>

          <div className="w-full lg:w-72">
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-black">
              Active Building
            </label>
            {managedBuildings.length > 1 ? (
              <AdminBuildingSelect
                label=""
                options={managedBuildings.map((building) => ({
                  value: building.id,
                  label: getManagedBuildingOptionLabel(building),
                }))}
                value={buildingId ?? ''}
                onChange={onBuildingChange}
                className="w-full"
                menuAlign="right"
                fullWidth
              />
            ) : (
              <input
                value={activeBuildingLabel}
                readOnly
                className="w-full rounded-2xl border border-white/45 bg-white/85 px-3 py-2 text-sm text-black shadow-sm backdrop-blur-xl focus:outline-none"
              />
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="relative z-[60] mb-8 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
      <div className="rounded-2xl border border-white/35 bg-white/75 px-6 py-4 shadow-[0_24px_60px_rgba(15,23,42,0.17)] backdrop-blur-xl transition-all duration-300 hover:bg-white/85 hover:shadow-2xl">
        <h2 className="text-2xl font-bold text-gray-800">{title}</h2>
        <div className="mt-2 text-sm text-gray-600">{description}</div>
      </div>

      <div className="w-full max-w-sm rounded-2xl border border-white/35 bg-white/75 p-4 shadow-xl backdrop-blur-xl">
        <p className="text-[11px] font-bold uppercase tracking-wide text-black">
          Active Building
        </p>
        {managedBuildings.length > 1 ? (
          <AdminBuildingSelect
            label=""
            options={managedBuildings.map((building) => ({
              value: building.id,
              label: getManagedBuildingOptionLabel(building),
            }))}
            value={buildingId ?? ''}
            onChange={onBuildingChange}
            className="mt-3 w-full"
            fullWidth
          />
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
