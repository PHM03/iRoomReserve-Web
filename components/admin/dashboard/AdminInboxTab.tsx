import AdminBuildingSelect from '@/components/admin/AdminBuildingSelect';
import MessagesSection from '@/components/messages/MessagesSection';
import { getManagedBuildingOptionLabel } from './shared';

interface BuildingOption {
  id: string;
  name: string;
}

interface AdminInboxTabProps {
  activeBuildingLabel: string;
  buildingId: string;
  managedBuildings: BuildingOption[];
  onBuildingChange: (buildingId: string) => void;
}

export default function AdminInboxTab({
  activeBuildingLabel,
  buildingId,
  managedBuildings,
  onBuildingChange,
}: Readonly<AdminInboxTabProps>) {
  return (
    <div>
      <div className="mb-5 flex w-full flex-col gap-3 rounded-xl border border-white/70 bg-white px-6 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-bold text-black">Staff Messages</h2>
        {managedBuildings.length > 1 ? (
          <div className="w-full sm:ml-auto sm:w-72">
            <AdminBuildingSelect
              label="Active Building:"
              options={managedBuildings.map((building) => ({
                value: building.id,
                label: getManagedBuildingOptionLabel(building),
              }))}
              value={buildingId}
              onChange={onBuildingChange}
              fullWidth
            />
          </div>
        ) : (
          <div className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[#a12124]/30 bg-[#a12124]/10 px-3 py-1 text-xs font-bold text-[#7f1d1d] shadow-sm sm:ml-auto">
            <span>Active Building: {activeBuildingLabel}</span>
          </div>
        )}
      </div>

      <MessagesSection />
    </div>
  );
}
