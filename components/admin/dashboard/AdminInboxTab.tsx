import MessagesSection from '@/components/messages/MessagesSection';

interface AdminInboxTabProps {
  showBuildingName: boolean;
}

export default function AdminInboxTab({
  showBuildingName,
}: Readonly<AdminInboxTabProps>) {
  return (
    <div>
      <div className="relative z-[60] mb-6 flex w-full flex-col gap-3 rounded-2xl border border-white/35 bg-white px-6 py-4 shadow-[0_24px_60px_rgba(15,23,42,0.17)]  transition-all duration-300 hover:bg-white hover:shadow-2xl sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-bold text-black">Staff Messages</h2>
      </div>

      <MessagesSection showBuildingName={showBuildingName} />
    </div>
  );
}
