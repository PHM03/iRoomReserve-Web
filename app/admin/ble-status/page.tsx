'use client';

import AdminNoBuildingAssigned from '@/components/admin/AdminNoBuildingAssigned';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import BleAdminMonitor from '@/components/BleAdminMonitor';
import { useAdminStatusPages } from '@/hooks/useAdminStatusPages';

export default function AdminBleStatusPage() {
  const {
    managedBuildings,
    buildingId,
    buildingName,
    activeBuildingLabel,
    setSelectedBuildingId,
    rooms,
  } = useAdminStatusPages();

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-[100px] py-8 relative z-10">
      {!buildingId || !buildingName ? (
        <AdminNoBuildingAssigned />
      ) : (
        <>
          <AdminPageHeader
            title="BLE Beacon Status"
            description={
              <>
                Live ESP32 beacon telemetry and connection history for{' '}
                <span className="text-primary font-bold">{buildingName}</span>.
              </>
            }
            managedBuildings={managedBuildings}
            buildingId={buildingId}
            buildingName={buildingName}
            activeBuildingLabel={activeBuildingLabel}
            onBuildingChange={setSelectedBuildingId}
          />

          <BleAdminMonitor buildingName={buildingName} rooms={rooms} />
        </>
      )}
    </main>
  );
}
