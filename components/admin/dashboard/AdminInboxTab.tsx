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
      <div className="relative z-[60] mb-6 flex w-full flex-col gap-3 rounded-2xl border border-white/35 bg-white/75 px-6 py-4 shadow-[0_24px_60px_rgba(15,23,42,0.17)] backdrop-blur-xl transition-all duration-300 hover:bg-white/85 hover:shadow-2xl sm:flex-row sm:items-center sm:justify-between">
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
