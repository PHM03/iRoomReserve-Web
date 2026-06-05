import { formatDate } from '@/lib/utils/dateTime';

interface RoleBadgeProps {
  role: string;
}

interface StatusBadgeProps {
  status: string;
}

interface StarRatingProps {
  rating: number;
}

export function RoleBadge({ role }: Readonly<RoleBadgeProps>) {
  const style = role === 'Faculty Professor' ? 'ui-badge-green' : 'ui-badge-blue';

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${style}`}>
      {role}
    </span>
  );
}

export function StatusBadge({ status }: Readonly<StatusBadgeProps>) {
  const style = (() => {
    switch (status) {
      case 'Occupied':
        return 'ui-badge-red';
      case 'Reserved':
        return 'ui-badge-blue';
      case 'Unavailable':
        return 'ui-badge-red';
      case 'Available':
        return 'ui-badge-green';
      case 'approved':
        return 'ui-badge-green';
      case 'rejected':
        return 'ui-badge-red';
      case 'pending':
        return 'ui-badge-yellow';
      case 'completed':
        return 'ui-badge-blue';
      case 'expired':
        return 'ui-badge-gray';
      default:
        return 'ui-badge-gray';
    }
  })();

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${style}`}>
      {status}
    </span>
  );
}

export function StarRating({ rating }: Readonly<StarRatingProps>) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          className={`w-4 h-4 ${star <= rating ? 'ui-text-yellow' : 'text-black'}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

export const ROOM_TYPE_OPTIONS = [
  'Conference Room',
  'Glass Room',
  'Classroom',
  'Specialized Room',
  'Gymnasium',
  'Open Area',
] as const;

export const ROOM_TYPE_LABELS: Record<(typeof ROOM_TYPE_OPTIONS)[number], string> = {
  'Conference Room': 'Conference Room',
  'Glass Room': 'Glass Room',
  'Classroom': 'Classroom',
  'Specialized Room':
    'Specialized Room (Laboratory, Storage Room, and other program-specific facilities)',
  'Gymnasium': 'Gymnasium',
  'Open Area': 'Open Area',
};

export const ROOM_AC_OPTIONS = [
  'Working',
  'Not Working',
  'No Air Conditioning',
] as const;

export const ROOM_DISPLAY_OPTIONS = [
  'Working',
  'Not Working',
  'No Television or Projector',
] as const;

export function formatSentimentLabel(label: string) {
  return label
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function getSentimentBadgeClasses(label: string) {
  if (label === 'very_positive') {
    return 'border-emerald-600/30 bg-emerald-600/15 text-emerald-800';
  }

  if (label === 'positive') {
    return 'border-green-500/25 bg-green-500/10 text-green-700';
  }

  if (label === 'very_negative') {
    return 'border-red-700/30 bg-red-700/15 text-red-800';
  }

  if (label === 'negative') {
    return 'border-red-500/25 bg-red-500/10 text-red-700';
  }

  return 'border-slate-500/25 bg-slate-500/10 text-slate-700';
}

export function getManagedBuildingDisplayLabel(input: {
  id?: string | null;
  name?: string | null;
}) {
  const searchValue = `${input.id ?? ''} ${input.name ?? ''}`.toLowerCase();

  if (
    searchValue.includes('sdca digital campus') ||
    searchValue.includes('sdca-digital-campus')
  ) {
    return 'Digital Campus';
  }

  if (/\bgd[\s-]?1\b/.test(searchValue)) {
    return 'GD1';
  }

  if (/\bgd[\s-]?2\b/.test(searchValue)) {
    return 'GD2';
  }

  if (/\bgd[\s-]?3\b/.test(searchValue)) {
    return 'GD3';
  }

  return input.name?.trim() || input.id?.trim() || 'Assigned Building';
}

export function getManagedBuildingOptionLabel(building: { id: string; name: string }) {
  const displayLabel = getManagedBuildingDisplayLabel(building);
  return displayLabel === building.name ? displayLabel : `${displayLabel} - ${building.name}`;
}

export function formatReservationDates(dates?: string[], fallbackDate?: string) {
  const dateList = dates?.length ? dates : fallbackDate ? [fallbackDate] : [];
  return dateList.map((date) => formatDate(date)).join(', ');
}
