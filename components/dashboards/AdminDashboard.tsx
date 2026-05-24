'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AdminBuildingSelect from '@/components/admin/AdminBuildingSelect';
import type { AdminTab } from '@/components/layout/NavBar';
import AdminNoBuildingAssigned from '@/components/admin/AdminNoBuildingAssigned';
import AdminFeedbackTab from '@/components/admin/dashboard/AdminFeedbackTab';
import AdminInboxTab from '@/components/admin/dashboard/AdminInboxTab';
import AdminOverviewTab from '@/components/admin/dashboard/AdminOverviewTab';
import AdminPendingTab from '@/components/admin/dashboard/AdminPendingTab';
import AdminRoomHistoryTab from '@/components/admin/dashboard/AdminRoomHistoryTab';
import AdminManageRoomsTab from '@/components/admin/dashboard/AdminManageRoomsTab';
import {
  getManagedBuildingDisplayLabel,
  getManagedBuildingOptionLabel,
} from '@/components/admin/dashboard/shared';
import { useAuth } from '@/context/AuthContext';
import { useAdminTab } from '@/context/AdminTabContext';
import { fetchAdminDashboardSnapshot } from '@/lib/admin/adminDashboard';
import type { AdminDashboardSummary } from '@/lib/admin/adminDashboard';
import { getManagedBuildingsForCampus } from '@/lib/buildings/campusAssignments';
import { getBuildingById } from '@/lib/buildings/buildings';
import { getFeedbackByBuilding } from '@/lib/feedback/feedback';
import type { Feedback } from '@/lib/feedback/feedback';
import type { FeedbackSentimentSummary } from '@/lib/feedback/feedback-sentiment';
import type { RoomHistoryEntry } from '@/lib/rooms/roomHistory';
import { normalizeRoomCheckInMethod } from '@/lib/rooms/roomStatus';
import type { Room } from '@/lib/rooms/rooms';
import type { Reservation } from '@/lib/reservations/reservations';
import { isRoomInClass, type Schedule } from '@/lib/schedules/schedules';

interface AdminDashboardProps {
  firstName: string;
  activeTab: AdminTab;
  campusOverride?: 'main' | 'digi';
}

function getLocalDateKey(date: Date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export default function AdminDashboard({
  firstName,
  activeTab,
  campusOverride,
}: Readonly<AdminDashboardProps>) {
  const { firebaseUser, profile } = useAuth();
  const { setActiveTab, selectedBuildingId, setSelectedBuildingId } = useAdminTab();
  const managedCampus = campusOverride ?? profile?.campus;

  const managedBuildings = useMemo(
    () => getManagedBuildingsForCampus(managedCampus),
    [managedCampus]
  );
  const effectiveManagedBuildingId = managedBuildings.some(
    (building) => building.id === selectedBuildingId
  )
    ? selectedBuildingId
    : managedBuildings[0]?.id ?? '';
  const selectedManagedBuilding =
    managedBuildings.find((building) => building.id === effectiveManagedBuildingId) ??
    managedBuildings[0];
  const buildingId = selectedManagedBuilding?.id;
  const buildingName = selectedManagedBuilding?.name;
  const activeBuildingLabel = getManagedBuildingDisplayLabel({
    id: buildingId,
    name: buildingName,
  });

  const [requests, setRequests] = useState<Reservation[]>([]);
  const [allReservations, setAllReservations] = useState<Reservation[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [feedbackList, setFeedbackList] = useState<Feedback[]>([]);
  const [feedbackSummary, setFeedbackSummary] =
    useState<FeedbackSentimentSummary | null>(null);
  const [roomHistory, setRoomHistory] = useState<RoomHistoryEntry[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [buildingFloors, setBuildingFloors] = useState(0);
  const [dashboardSummary, setDashboardSummary] =
    useState<AdminDashboardSummary | null>(null);

  const reloadDashboard = useCallback(async () => {
    if (!buildingId || !firebaseUser?.uid) {
      return;
    }
    if (activeTab === 'inbox') {
      return;
    }

    try {
      if (activeTab === 'feedback') {
        const feedbackSnapshot = await getFeedbackByBuilding(buildingId);
        setFeedbackList(feedbackSnapshot.feedback);
        setFeedbackSummary(feedbackSnapshot.summary);
        return;
      }

      if (activeTab === 'manage-rooms') {
        return;
      }

      const snapshot = await fetchAdminDashboardSnapshot(buildingId, {
        includeApprovedReservations: activeTab === 'dashboard',
        includePendingRequests: activeTab === 'dashboard' || activeTab === 'pending',
        includeRoomHistory: activeTab === 'reservation-history',
        includeRooms: activeTab === 'dashboard',
        includeSchedules: activeTab === 'dashboard',
        includeSummary: activeTab === 'dashboard',
        pendingLimit: activeTab === 'dashboard' ? 3 : undefined,
        reservationDate: activeTab === 'dashboard' ? getLocalDateKey() : undefined,
        roomLimit: activeTab === 'dashboard' ? 5 : undefined,
        scheduleDayOfWeek: activeTab === 'dashboard' ? new Date().getDay() : undefined,
      });

      setAllReservations(snapshot.allReservations);
      setDashboardSummary(snapshot.summary);
      setRequests(snapshot.requests);
      setRoomHistory(snapshot.roomHistory);
      setRooms(snapshot.rooms);
      setSchedules(snapshot.schedules);
    } catch (error) {
      console.warn('Failed to load admin dashboard snapshot:', error);
      setAllReservations([]);
      setRequests([]);
      setRoomHistory([]);
      setRooms([]);
      setSchedules([]);
      setDashboardSummary(null);
      if (activeTab === 'feedback') {
        setFeedbackList([]);
        setFeedbackSummary(null);
      }
    }
  }, [activeTab, buildingId, firebaseUser?.uid]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void reloadDashboard();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [reloadDashboard]);

  useEffect(() => {
    if (buildingId && activeTab === 'manage-rooms') {
      getBuildingById(buildingId).then((building) => {
        if (building) {
          setBuildingFloors(building.floors);
        }
      });
    }
  }, [activeTab, buildingId]);

  const computeEffectiveStatus = useCallback(
    (room: Room): { status: string; detail: string } => {
      if (room.status === 'Unavailable') {
        return {
          status: 'Unavailable',
          detail: 'Manual override'
        };
      }

      if (room.status === 'Occupied') {
        if (
          normalizeRoomCheckInMethod(room.checkInMethod) === 'bluetooth' &&
          room.beaconConnected === false
        ) {
          return {
            status: 'Available',
            detail: 'Bluetooth beacon disconnected'
          };
        }

        return {
          status: 'Occupied',
          detail:
            normalizeRoomCheckInMethod(room.checkInMethod) === 'bluetooth'
              ? 'Bluetooth beacon connected'
              : 'Checked in',
        };
      }

      if (room.status === 'Reserved') {
        return {
          status: 'Reserved',
          detail: 'Reserved'
        };
      }

      const activeClass = isRoomInClass(schedules, room.id);
      if (activeClass) {
        return {
          status: 'Reserved',
          detail: `Class: ${activeClass.subjectName}`
        };
      }

      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now
        .getMinutes()
        .toString()
        .padStart(2, '0')}`;

      const activeReservation = allReservations.find(
        (reservation) =>
          reservation.roomId === room.id &&
          reservation.status === 'approved' &&
          reservation.date === today &&
          reservation.startTime <= currentTime &&
          reservation.endTime > currentTime
      );

      if (activeReservation) {
        const activeCheckInMethod = normalizeRoomCheckInMethod(
          activeReservation.checkInMethod ?? room.checkInMethod
        );

        if (
          activeReservation.checkedInAt &&
          activeCheckInMethod === 'bluetooth' &&
          room.beaconConnected === false
        ) {
          return {
            status: 'Available',
            detail: 'Bluetooth beacon disconnected'
          };
        }

        return activeReservation.checkedInAt
          ? {
            status: 'Occupied',
            detail: `Checked in: ${activeReservation.userName}`
          }
          : {
            status: 'Reserved',
            detail: `Reserved: ${activeReservation.userName}`
          };
      }

      return {
        status: 'Available',
        detail: ''
      };
    },
    [allReservations, schedules]
  );

  const ongoingCount = rooms.filter(
    (room) => computeEffectiveStatus(room).status === 'Occupied'
  ).length;
  const reservedCount = rooms.filter(
    (room) => computeEffectiveStatus(room).status === 'Reserved'
  ).length;
  const unavailableCount = rooms.filter((room) => room.status === 'Unavailable').length;
  const availableCount = rooms.length - ongoingCount - reservedCount - unavailableCount;
  const summaryOngoingCount = dashboardSummary?.occupiedRooms ?? ongoingCount;
  const summaryReservedCount = dashboardSummary?.reservedRooms ?? reservedCount;
  const summaryUnavailableCount = dashboardSummary?.unavailableRooms ?? unavailableCount;
  const summaryAvailableCount = dashboardSummary?.availableRooms ?? availableCount;
  const pendingCount = dashboardSummary?.pendingRequests ?? requests.length;
  const approverEmail = profile?.email || firebaseUser?.email;

  if (!buildingId || !buildingName) {
    return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        <div className="mb-8 rounded-2xl border border-white/20 bg-white/70 px-6 py-4 shadow-xl backdrop-blur-md">
          <h2 className="text-2xl font-bold text-black">Welcome, {firstName}</h2>
          <p className="text-black mt-1">Administrator Dashboard</p>
        </div>
        <AdminNoBuildingAssigned />
      </main>
    );
  }

  return (
    <main
      className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 ${
        activeTab === 'dashboard'
          ? 'py-4 pt-[100px] pb-6'
          : 'py-8 pt-[100px] pb-24 md:pb-8'
      }`}
    >
      {activeTab === 'dashboard' ? (
        <div className="mb-6">
          <div className="flex flex-col gap-3 rounded-2xl border border-white/20 bg-white/70 px-6 py-4 shadow-xl backdrop-blur-md transition-all duration-300 hover:bg-white/80 hover:shadow-2xl sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-gray-800">
                Welcome, {firstName}
              </h2>
            </div>
            {managedBuildings.length > 1 ? (
              <div className="w-full sm:ml-auto sm:w-72">
                <AdminBuildingSelect
                  label="Active Building:"
                  options={managedBuildings.map((building) => ({
                    value: building.id,
                    label: getManagedBuildingOptionLabel(building),
                  }))}
                  value={buildingId}
                  onChange={setSelectedBuildingId}
                  className="w-full"
                  fullWidth
                />
              </div>
            ) : (
              <div className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[#a12124]/30 bg-[#a12124]/10 px-3 py-1 text-xs font-bold text-[#7f1d1d] shadow-sm sm:ml-auto">
                <span>Active Building: {activeBuildingLabel}</span>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {activeTab === 'dashboard' && (
        <AdminOverviewTab
          allReservations={allReservations}
          approverEmail={approverEmail}
          availableCount={summaryAvailableCount}
          buildingId={buildingId}
          buildingName={buildingName}
          computeEffectiveStatus={computeEffectiveStatus}
          currentUserId={firebaseUser?.uid}
          dashboardSummary={dashboardSummary}
          ongoingCount={summaryOngoingCount}
          onReload={reloadDashboard}
          pendingCount={pendingCount}
          requests={requests}
          reservedCount={summaryReservedCount}
          rooms={rooms}
          setActiveTab={setActiveTab}
          unavailableCount={summaryUnavailableCount}
        />
      )}

      {activeTab === 'manage-rooms' && (
        <AdminManageRoomsTab
          activeBuildingLabel={activeBuildingLabel}
          buildingFloors={buildingFloors}
          buildingId={buildingId}
          buildingName={buildingName}
          managedBuildings={managedBuildings}
          onBuildingChange={setSelectedBuildingId}
        />
      )}

      {activeTab === 'feedback' && (
        <AdminFeedbackTab
          activeBuildingLabel={activeBuildingLabel}
          buildingId={buildingId}
          feedbackList={feedbackList}
          feedbackSummary={feedbackSummary}
          managedBuildings={managedBuildings}
          onBuildingChange={setSelectedBuildingId}
          onReload={reloadDashboard}
          rooms={rooms}
        />
      )}

      {activeTab === 'reservation-history' && (
        <AdminRoomHistoryTab
          activeBuildingLabel={activeBuildingLabel}
          buildingId={buildingId}
          managedBuildings={managedBuildings}
          onBuildingChange={setSelectedBuildingId}
          roomHistory={roomHistory}
        />
      )}

      {activeTab === 'pending' && (
        <AdminPendingTab
          approverEmail={approverEmail}
          activeBuildingLabel={activeBuildingLabel}
          buildingId={buildingId}
          currentUserId={firebaseUser?.uid}
          requests={requests}
          onReload={reloadDashboard}
          managedBuildings={managedBuildings}
          onBuildingChange={setSelectedBuildingId}
        />
      )}

      {activeTab === 'inbox' && (
        <AdminInboxTab
          activeBuildingLabel={activeBuildingLabel}
          buildingId={buildingId}
          managedBuildings={managedBuildings}
          onBuildingChange={setSelectedBuildingId}
        />
      )}
    </main>
  );
}
