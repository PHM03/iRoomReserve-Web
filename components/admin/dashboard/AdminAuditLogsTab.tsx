'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { onAllUsers } from '@/lib/auth/auth';

interface AuditLog {
  id: string;
  action: string;
  summary: string;
  entityId: string;
  entityType: string;
  category?: string;
  actorName: string;
  actorUid?: string;
  actorEmail?: string | null;
  actorRole?: string | null;
  targetUserId?: string | null;
  targetName?: string | null;
  targetEmail?: string | null;
  targetRole?: string | null;
  campus?: string | null;
  buildingName?: string | null;
  buildingId?: string | null;
  createdAt?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
  changes?: Record<string, { from: string | number | boolean | null; to: string | number | boolean | null }>;
}

const actionLabels: Record<string, string> = {
  'reservation.created': 'Reservation created',
  'reservation.approved': 'Reservation approved',
  'reservation.rejected': 'Reservation rejected',
  'reservation.cancelled': 'Reservation cancelled',
  'reservation.checked_in': 'Reservation check-in',
  'reservation.completed': 'Reservation completed',
  'reservation.completion_confirmed': 'Completion confirmed',
  'reservation.expired': 'Reservation expired',
  'reservation.deleted': 'Reservation deleted',
  'reservation.revision_requested': 'Reservation change requested',
  'reservation.revision_accepted': 'Reservation change accepted',
  'reservation.revision_cancelled': 'Reservation change cancelled',
  'reservation.expiration_message_sent': 'Expiration intervention sent',
  'reservation.document_uploaded': 'Concept paper uploaded',
  'reservation.document_removed': 'Concept paper removed',
  'room.created': 'Room added',
  'room.updated': 'Room updated',
  'room.deleted': 'Room deleted',
  'room.status_changed': 'Room status changed',
  'room.unavailability_added': 'Room marked unavailable',
  'room.unavailability_removed': 'Room availability restored',
  'schedule.created': 'Class schedule created',
  'schedule.updated': 'Class schedule updated',
  'schedule.deleted': 'Class schedule deleted',
  'schedule.cleared': 'Room schedules cleared',
  'feedback.submitted': 'Feedback submitted',
  'feedback.responded': 'Feedback answered',
  'admin_request.responded': 'Admin request answered',
  'building.floor_created': 'Floor added',
  'building.floor_updated': 'Floor updated',
  'building.floor_deleted': 'Floor deleted',
  'building.created': 'Building created',
  'building.updated': 'Building updated',
  'account.status_changed': 'Account access changed',
  'account.password_changed': 'Password changed',
  'account.profile_updated': 'Profile updated',
};

const categoryOptions = [
  'Authentication',
  'Reservation',
  'User Management',
  'Room Management',
  'Building Management',
  'Schedule Management',
  'Feedback',
  'Room Status',
  'BLE / Occupancy',
];

function getLogCategory(log: AuditLog) {
  if (log.category) return log.category;
  if (log.action.startsWith('reservation.')) return 'Reservation';
  if (log.action.startsWith('room.unavailability') || log.action === 'room.status_changed') return 'Room Status';
  if (log.action.startsWith('room.')) return 'Room Management';
  if (log.action.startsWith('schedule.')) return 'Schedule Management';
  if (log.action.startsWith('feedback.')) return 'Feedback';
  if (log.action.startsWith('building.')) return 'Building Management';
  if (log.action === 'account.password_changed') return 'Authentication';
  if (log.action.startsWith('account.') || log.action.startsWith('admin_request.')) return 'User Management';
  return 'System Configuration';
}

const roleOptions = [
  { value: 'Student', label: 'Student' },
  { value: 'Faculty Professor', label: 'Professor' },
  { value: 'Building Admin', label: 'Building Admin' },
  { value: 'Utility Staff', label: 'Utility Staff' },
  { value: 'Super Admin', label: 'Super Admin' },
  { value: 'System', label: 'System' },
];

function formatDate(value?: string | null) {
  if (!value) return 'Time unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function localDateKey(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function displayRole(role?: string | null) {
  const normalized = role?.trim().toLowerCase();
  if (['administrator', 'admin', 'building admin', 'building_admin'].includes(normalized ?? '')) {
    return 'Building Admin';
  }
  if (['faculty', 'faculty professor'].includes(normalized ?? '')) return 'Faculty Professor';
  if (['utility', 'utility staff'].includes(normalized ?? '')) return 'Utility Staff';
  if (normalized === 'student') return 'Student';
  if (['super admin', 'super_admin'].includes(normalized ?? '')) return 'Super Admin';
  return role ?? '';
}

function matchesUserSearch(
  search: string,
  user: { name?: string | null; email?: string | null; role?: string | null; uid?: string | null },
) {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  const searchableValues = [user.name, user.email, displayRole(user.role), user.uid]
    .filter((value): value is string => Boolean(value));
  return searchableValues.join(' · ').toLowerCase().includes(needle) ||
    searchableValues.some((value) => value.toLowerCase().includes(needle));
}

const filterControlClass =
  'w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-[#a12124] focus:ring-2 focus:ring-[#a12124]/15';

type ActorScope = 'neutral' | 'all' | 'user';

export default function AdminAuditLogsTab({ campus }: Readonly<{ campus?: 'main' | 'digi' }>) {
  const { firebaseUser } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [directoryUsers, setDirectoryUsers] = useState<Array<{
    uid: string;
    name: string;
    email: string;
    role: string;
  }>>([]);
  const [actorSearch, setActorSearch] = useState('');
  const [actorFilterUid, setActorFilterUid] = useState('');
  const [actorScope, setActorScope] = useState<ActorScope>('neutral');
  const [actorSuggestionsOpen, setActorSuggestionsOpen] = useState(false);
  const [activeActorIndex, setActiveActorIndex] = useState(0);
  const [roleFilter, setRoleFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [campusFilter, setCampusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!firebaseUser || actorScope === 'neutral' || (actorScope === 'user' && !actorFilterUid)) {
        setLogs([]);
        setLoading(false);
        setError('');
        return;
      }
      setLoading(true);
      setError('');
      try {
        const token = await firebaseUser.getIdToken();
        const searchParams = new URLSearchParams();
        if (campus) searchParams.set('campus', campus);
        if (actorScope === 'all') searchParams.set('allUsers', 'true');
        if (actorScope === 'user') searchParams.set('performedBy', actorFilterUid);
        const params = searchParams.size ? `?${searchParams.toString()}` : '';
        const response = await fetch(`/api/audit-logs${params}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (!response.ok) throw new Error('Unable to load audit logs.');
        const data = (await response.json()) as { logs?: AuditLog[] };
        if (!cancelled) setLogs(data.logs ?? []);
      } catch {
        if (!cancelled) setError('Unable to load audit logs. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [actorFilterUid, actorScope, campus, firebaseUser]);

  useEffect(() => {
    if (!firebaseUser) return;
    return onAllUsers((users) => {
      setDirectoryUsers(users.map((user) => ({
        uid: user.uid,
        name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email,
        email: user.email,
        role: displayRole(user.role),
      })));
    });
  }, [firebaseUser]);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const eventDate = localDateKey(log.createdAt);
      return (actorFilterUid ? log.actorUid === actorFilterUid : matchesUserSearch(actorSearch, {
          uid: log.actorUid,
          name: log.actorName,
          email: log.actorEmail,
          role: log.actorRole,
        })) &&
        (!roleFilter || displayRole(log.actorRole) === roleFilter) &&
        (!categoryFilter || getLogCategory(log) === categoryFilter) &&
        (!campusFilter || log.campus === campusFilter) &&
        (!dateFrom || (eventDate && eventDate >= dateFrom)) &&
        (!dateTo || (eventDate && eventDate <= dateTo));
    });
  }, [actorFilterUid, actorSearch, campusFilter, categoryFilter, dateFrom, dateTo, logs, roleFilter]);

  const actors = useMemo(() => {
    const uniqueActors = new Map<string, { uid: string; name: string; email: string; role: string }>();
    directoryUsers.forEach((user) => uniqueActors.set(user.uid, user));
    logs.forEach((log) => {
      if (!log.actorUid) return;
      if (!uniqueActors.has(log.actorUid)) uniqueActors.set(log.actorUid, {
        uid: log.actorUid,
        name: log.actorName,
        email: log.actorEmail || '',
        role: displayRole(log.actorRole),
      });
    });
    return [...uniqueActors.values()].sort((left, right) => left.name.localeCompare(right.name));
  }, [directoryUsers, logs]);
  const selectedActor = actors.find((actor) => actor.uid === actorFilterUid);
  const normalizedActorSearch = actorSearch.trim().toLowerCase();
  const matchingActors = normalizedActorSearch
    ? actors.filter((actor) =>
        `${actor.name} ${actor.email} ${actor.role}`.toLowerCase().includes(normalizedActorSearch),
      ).slice(0, 8)
    : [];
  const clearFilters = () => {
    setActorSearch('');
    setActorFilterUid('');
    setActorScope('neutral');
    setActorSuggestionsOpen(false);
    setActiveActorIndex(0);
    setRoleFilter('');
    setCategoryFilter('');
    setCampusFilter('');
    setDateFrom('');
    setDateTo('');
  };
  const hasActiveFilters = Boolean(
    actorSearch || actorFilterUid || actorScope !== 'neutral' || roleFilter || categoryFilter || campusFilter || dateFrom || dateTo,
  );

  return (
    <section className="rounded-2xl border border-white/40 bg-white p-5 shadow-[0_24px_60px_rgba(15,23,42,0.14)] sm:p-7">
      <div className="mb-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#a12124]">Super Admin</p>
          <h2 className="mt-1 text-2xl font-bold text-gray-900">Audit logs</h2>
          <p className="mt-1 text-sm text-gray-600">Review account, reservation, and facility activity.</p>
        </div>
      </div>

      <div className="mb-4 max-w-2xl">
        <label className="text-xs font-semibold text-gray-600">
          Performed by
          <div
            className="relative mt-1"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setActorSuggestionsOpen(false);
              }
            }}
          >
            {actorScope === 'all' ? (
              <div className="flex min-h-11 items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#a12124]/10 text-[10px] font-bold text-[#a12124]">All</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-gray-900">All users</span>
                  <span className="block text-xs text-gray-500">Showing activity from everyone</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setActorScope('neutral');
                    setActorSuggestionsOpen(false);
                  }}
                  className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                  aria-label="Clear all users selection"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ) : selectedActor ? (
              <div className="flex min-h-11 items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#a12124]/10 text-xs font-bold text-[#a12124]">
                  {selectedActor.name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-gray-900">{selectedActor.name}</span>
                  <span className="block truncate text-xs text-gray-500">{selectedActor.email || selectedActor.role}</span>
                </span>
                {selectedActor.role ? (
                  <span className="shrink-0 rounded-full bg-[#a12124]/10 px-2.5 py-1 text-[10px] font-semibold text-[#a12124]">
                    {selectedActor.role}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    setActorFilterUid('');
                    setActorScope('neutral');
                    setActorSearch('');
                    setActorSuggestionsOpen(true);
                  }}
                  className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                  aria-label="Clear performed by user"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ) : (
              <>
                <input
                  value={actorSearch}
                  onChange={(event) => {
                    setActorSearch(event.target.value);
                    setActiveActorIndex(0);
                    setActorSuggestionsOpen(true);
                  }}
                  onFocus={() => setActorSuggestionsOpen(true)}
                  onKeyDown={(event) => {
                    const choiceCount = matchingActors.length + 1;
                    if (event.key === 'ArrowDown') {
                      event.preventDefault();
                      setActorSuggestionsOpen(true);
                      setActiveActorIndex((index) => (index + 1) % choiceCount);
                    } else if (event.key === 'ArrowUp') {
                      event.preventDefault();
                      setActiveActorIndex((index) => (index - 1 + choiceCount) % choiceCount);
                    } else if (event.key === 'Enter' && actorSuggestionsOpen && activeActorIndex === 0) {
                      event.preventDefault();
                      setActorFilterUid('');
                      setActorScope('all');
                      setActorSearch('');
                      setActorSuggestionsOpen(false);
                    } else if (event.key === 'Enter' && actorSuggestionsOpen && matchingActors[activeActorIndex - 1]) {
                      event.preventDefault();
                      setActorFilterUid(matchingActors[activeActorIndex - 1].uid);
                      setActorScope('user');
                      setActorSearch('');
                      setActorSuggestionsOpen(false);
                    } else if (event.key === 'Escape') {
                      setActorSuggestionsOpen(false);
                    }
                  }}
                  placeholder="Search name"
                  className={filterControlClass}
                  autoComplete="off"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={actorSuggestionsOpen}
                  aria-controls="audit-actor-suggestions"
                />
                {actorSuggestionsOpen ? (
                  <div id="audit-actor-suggestions" role="listbox" className="absolute left-0 right-0 top-full z-30 mt-2 max-h-64 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl">
                    <button
                      type="button"
                      role="option"
                      aria-selected={activeActorIndex === 0}
                      onMouseEnter={() => setActiveActorIndex(0)}
                      onClick={() => {
                        setActorFilterUid('');
                        setActorScope('all');
                        setActorSearch('');
                        setActorSuggestionsOpen(false);
                      }}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${activeActorIndex === 0 ? 'bg-[#a12124]/5' : 'hover:bg-gray-50'}`}
                    >
                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#a12124]/10 text-xs font-bold text-[#a12124]">All</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-gray-900">All users</span>
                        <span className="block text-xs text-gray-500">Show activity from everyone</span>
                      </span>
                    </button>
                    {matchingActors.map((actor, index) => (
                      <button
                        key={actor.uid}
                        type="button"
                        role="option"
                        aria-selected={index + 1 === activeActorIndex}
                        onMouseEnter={() => setActiveActorIndex(index + 1)}
                        onClick={() => {
                          setActorFilterUid(actor.uid);
                          setActorScope('user');
                          setActorSearch('');
                          setActorSuggestionsOpen(false);
                        }}
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${index + 1 === activeActorIndex ? 'bg-[#a12124]/5' : 'hover:bg-gray-50'}`}
                      >
                        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-600">
                          {actor.name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-gray-900">{actor.name}</span>
                          <span className="block truncate text-xs text-gray-500">{actor.email || 'Email not provided'}</span>
                        </span>
                        <span className="shrink-0 rounded-full bg-gray-100 px-2 py-1 text-[10px] font-medium text-gray-600">{actor.role}</span>
                      </button>
                    ))}
                    {actorSearch.trim() && matchingActors.length === 0 ? (
                      <p className="px-3 py-4 text-center text-sm text-gray-500">No matching users found.</p>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </label>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <label className="text-xs font-semibold text-gray-600">
          Performed by role
          <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} disabled={actorScope === 'neutral'} className={`${filterControlClass} mt-1 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400`}>
            <option value="">All roles</option>
            {roleOptions.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-gray-600">
          Category
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} disabled={actorScope === 'neutral'} className={`${filterControlClass} mt-1 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400`}>
            <option value="">All categories</option>
            {categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </label>
        {!campus ? (
          <label className="text-xs font-semibold text-gray-600">
            Campus
            <select value={campusFilter} onChange={(event) => setCampusFilter(event.target.value)} disabled={actorScope === 'neutral'} className={`${filterControlClass} mt-1 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400`}>
              <option value="">All campuses</option>
              <option value="main">Main Campus</option>
              <option value="digi">Digital Campus</option>
            </select>
          </label>
        ) : null}
        <label className="text-xs font-semibold text-gray-600">
          From
          <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} disabled={actorScope === 'neutral'} className={`${filterControlClass} mt-1 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400`} />
        </label>
        <label className="text-xs font-semibold text-gray-600">
          To
          <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} disabled={actorScope === 'neutral'} className={`${filterControlClass} mt-1 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400`} />
        </label>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600">
        <span>
          {actorScope === 'neutral'
            ? 'Choose a user scope to load audit events'
            : `Showing ${filteredLogs.length} of ${logs.length} events`}
        </span>
        <button type="button" onClick={clearFilters} className="font-semibold text-[#a12124] transition hover:underline">
          Clear filters
        </button>
      </div>

      {loading ? <p className="py-12 text-center text-sm text-gray-600">Loading audit logs…</p> : null}
      {!loading && error ? <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p> : null}
      {!loading && !error && filteredLogs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 px-5 py-12 text-center">
          <p className="font-semibold text-gray-800">
            {actorScope === 'neutral'
              ? 'Choose users to view activity'
              : hasActiveFilters
                ? 'No matching activity'
                : 'No audit activity yet'}
          </p>
          <p className="mt-1 text-sm text-gray-600">
            {actorScope === 'neutral'
              ? 'Select All users or search for a person in Performed by to load audit logs.'
              : hasActiveFilters
                ? 'Try changing or clearing the selected filters.'
                : 'New account, reservation, and room actions will appear here.'}
          </p>
        </div>
      ) : null}

      {!loading && !error && filteredLogs.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full min-w-[980px] border-collapse text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
              <tr>
                <th className="px-4 py-3 font-bold">Activity</th>
                <th className="px-4 py-3 font-bold">Performed by</th>
                <th className="px-4 py-3 font-bold">User affected</th>
                <th className="px-4 py-3 font-bold">Location</th>
                <th className="px-4 py-3 font-bold">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="align-top hover:bg-gray-50/70">
                  <td className="px-4 py-4">
                    <p className="font-semibold text-gray-900">{actionLabels[log.action] ?? log.action}</p>
                    <p className="mt-1 inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">{getLogCategory(log)}</p>
                    <p className="mt-0.5 text-gray-600">{log.summary}</p>
                    {Object.entries(log.changes ?? {}).length > 0 ? (
                      <ul className="mt-2 space-y-0.5 text-xs text-gray-500">
                        {Object.entries(log.changes ?? {}).map(([field, change]) => (
                          <li key={field}>{field}: {change.from ?? '—'} → {change.to ?? '—'}</li>
                        ))}
                      </ul>
                    ) : null}
                    {log.metadata?.date ? (
                      <p className="mt-1 text-xs text-gray-500">
                        {String(log.metadata.date)}{log.metadata.startTime ? ` · ${log.metadata.startTime}${log.metadata.endTime ? `–${log.metadata.endTime}` : ''}` : ''}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-4">
                    <p className="font-medium text-gray-900">{log.actorName}</p>
                    <p className="text-xs text-gray-600">{log.actorEmail ?? 'Email unavailable'}</p>
                    <p className="mt-1 text-xs text-gray-500">{displayRole(log.actorRole) || 'User'}</p>
                  </td>
                  <td className="px-4 py-4">
                    {log.targetUserId ? (
                      <>
                        <p className="font-medium text-gray-900">{log.targetName || `User ${log.targetUserId.slice(0, 8)}`}</p>
                        {log.targetEmail ? <p className="text-xs text-gray-600">{log.targetEmail}</p> : null}
                        {log.targetRole ? <p className="mt-1 text-xs text-gray-500">{displayRole(log.targetRole)}</p> : null}
                      </>
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-4 text-gray-700">
                    <p>{log.buildingName ?? (log.campus === 'digi' ? 'Digital Campus' : log.campus === 'main' ? 'Main Campus' : 'Account')}</p>
                    {log.metadata?.roomName ? <p className="mt-0.5 text-xs text-gray-500">{String(log.metadata.roomName)}</p> : null}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-gray-600">{formatDate(log.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-gray-200 px-4 py-2.5 text-xs text-gray-500">Showing up to 300 most recent events.</p>
        </div>
      ) : null}
    </section>
  );
}
