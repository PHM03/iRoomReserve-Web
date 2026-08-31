'use client';

import { useSearchParams } from 'next/navigation';
import AdminNoBuildingAssigned from '@/components/admin/AdminNoBuildingAssigned';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import AdminRoomStatusSection from '@/components/admin/AdminRoomStatusSection';
import { useAdminStatusPages } from '@/hooks/useAdminStatusPages';

type CampusOverride = 'main' | 'digi';

function getCampusOverride(value: string | null): CampusOverride | undefined {
  return value === 'main' || value === 'digi' ? value : undefined;
}

export default function AdminRoomStatusPage() {
  const searchParams = useSearchParams();
  const campusOverride = getCampusOverride(searchParams.get('campus'));
  const {
    managedBuildings,
    buildingId,
    buildingName,
    activeBuildingLabel,
    setSelectedBuildingId,
    rooms,
    statusMonitorFloorGroups,
    handleStatusChange,
    computeEffectiveStatus,
    pendingFinishReservationsByRoomId,
    handleConfirmFinishedReservation,
  } = useAdminStatusPages({ campusOverride });

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-[100px] py-8 relative z-10">
      {!buildingId || !buildingName ? (
        <AdminNoBuildingAssigned />
      ) : (
        <div className="flex w-full flex-col gap-4">
          <AdminPageHeader
            title="Room Status Monitor"
            description={
              <>
                Live room availability controls for{' '}
                <span className="text-primary font-bold">{buildingName}</span>.
              </>
            }
            managedBuildings={managedBuildings}
            buildingId={buildingId}
            buildingName={buildingName}
            activeBuildingLabel={activeBuildingLabel}
            onBuildingChange={setSelectedBuildingId}
            integratedBuildingField
          />

          <AdminRoomStatusSection
            buildingId={buildingId}
            rooms={rooms}
            statusMonitorFloorGroups={statusMonitorFloorGroups}
            computeEffectiveStatus={computeEffectiveStatus}
            onStatusChange={handleStatusChange}
            pendingFinishReservationsByRoomId={pendingFinishReservationsByRoomId}
            onConfirmFinishedReservation={handleConfirmFinishedReservation}
          />
        </div>
      )}
    </main>
  );
}
