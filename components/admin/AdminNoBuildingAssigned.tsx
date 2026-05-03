'use client';

interface AdminNoBuildingAssignedProps {
  title?: string;
  description?: string;
}

export default function AdminNoBuildingAssigned({
  title = 'No Building Assigned',
  description = 'Your account has been approved, but the Super Admin has not yet assigned a building to you. Please contact the Super Admin to get a building assignment.',
}: Readonly<AdminNoBuildingAssignedProps>) {
  return (
    <div className="glass-card p-12 text-center">
      <div className="w-16 h-16 rounded-full bg-yellow-500/10 flex items-center justify-center mx-auto mb-4">
        <svg
          className="w-8 h-8 ui-text-yellow"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
          />
        </svg>
      </div>
      <h3 className="text-lg font-bold text-black mb-2">{title}</h3>
      <p className="text-sm text-black max-w-sm mx-auto">{description}</p>
    </div>
  );
}
