'use client';

import AdminClassSchedulesSection from '@/components/admin/AdminClassSchedulesSection';
import AdminNoBuildingAssigned from '@/components/admin/AdminNoBuildingAssigned';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import { useAdminStatusPages } from '@/hooks/useAdminStatusPages';

export default function AdminClassSchedulesPage() {
  const {
    managedBuildings,
    buildingId,
    buildingName,
    activeBuildingLabel,
    setSelectedBuildingId,
    rooms,
    schedules,
    showScheduleForm,
    schedRoomId,
    setSchedRoomId,
    schedSubject,
    setSchedSubject,
    schedInstructor,
    setSchedInstructor,
    schedDay,
    setSchedDay,
    schedStart,
    setSchedStart,
    schedEnd,
    setSchedEnd,
    addingSchedule,
    editingScheduleId,
    toggleScheduleForm,
    handleSaveSchedule,
    handleEditSchedule,
    handleDeleteSchedule,
  } = useAdminStatusPages();

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-[100px] py-8 relative z-10">
      {!buildingId || !buildingName ? (
        <AdminNoBuildingAssigned />
      ) : (
        <>
          <AdminPageHeader
            title="Class Schedules"
            description={
              <>
                Manage class schedule assignments for{' '}
                <span className="text-primary font-bold">{buildingName}</span>.
              </>
            }
            managedBuildings={managedBuildings}
            buildingId={buildingId}
            buildingName={buildingName}
            activeBuildingLabel={activeBuildingLabel}
            onBuildingChange={setSelectedBuildingId}
          />

          <AdminClassSchedulesSection
            schedules={schedules}
            rooms={rooms}
            showScheduleForm={showScheduleForm}
            schedRoomId={schedRoomId}
            schedSubject={schedSubject}
            schedInstructor={schedInstructor}
            schedDay={schedDay}
            schedStart={schedStart}
            schedEnd={schedEnd}
            addingSchedule={addingSchedule}
            editingScheduleId={editingScheduleId}
            onToggleForm={toggleScheduleForm}
            onSchedRoomIdChange={setSchedRoomId}
            onSchedSubjectChange={setSchedSubject}
            onSchedInstructorChange={setSchedInstructor}
            onSchedDayChange={setSchedDay}
            onSchedStartChange={setSchedStart}
            onSchedEndChange={setSchedEnd}
            onSaveSchedule={handleSaveSchedule}
            onEditSchedule={handleEditSchedule}
            onDeleteSchedule={handleDeleteSchedule}
          />
        </>
      )}
    </main>
  );
}
