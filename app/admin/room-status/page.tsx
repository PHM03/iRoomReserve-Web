'use client';

import AdminNoBuildingAssigned from '@/components/admin/AdminNoBuildingAssigned';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import AdminRoomStatusSection from '@/components/admin/AdminRoomStatusSection';
import { useAdminStatusPages } from '@/hooks/useAdminStatusPages';

export default function AdminRoomStatusPage() {
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
  } = useAdminStatusPages();

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-[100px] py-8 relative z-10">
      {!buildingId || !buildingName ? (
        <AdminNoBuildingAssigned />
      ) : (
        <>
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
          />

          <AdminRoomStatusSection
            buildingName={buildingName}
            rooms={rooms}
            statusMonitorFloorGroups={statusMonitorFloorGroups}
            computeEffectiveStatus={computeEffectiveStatus}
            onStatusChange={handleStatusChange}
          />
        </>
      )}
    </main>
  );
}
