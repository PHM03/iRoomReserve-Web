'use client';

import { useEffect, useMemo, useState } from 'react';
import AdminBuildingSelect from '@/components/admin/AdminBuildingSelect';
import AdminFloorFilter from '@/components/admin/AdminFloorFilter';
import {
    getBuildingFloorOptions,
    getFloorDisplayLabel,
    getPreferredDefaultFloorValue,
} from '@/lib/buildings/floorLabels';
import {
    addRoom,
    deleteRoom,
    getRoomCountsByBuilding,
    getRoomsByBuilding,
    getRoomsByBuildingAndFloor,
    updateRoom,
    type Room,
    type RoomCountSummary,
    type RoomInput,
} from '@/lib/rooms/rooms';
import {
    getManagedBuildingOptionLabel,
    ROOM_AC_OPTIONS,
    ROOM_DISPLAY_OPTIONS,
    ROOM_TYPE_LABELS,
    ROOM_TYPE_OPTIONS,
    StatusBadge,
} from './shared';

interface BuildingOption {
    id: string;
    name: string;
}

const EMPTY_ROOM_COUNTS: RoomCountSummary = {
  floors: [],
  total: 0
};

interface AdminManageRoomsTabProps {
    activeBuildingLabel: string;
    buildingFloors: number;
    buildingId: string;
    buildingName: string;
    managedBuildings: BuildingOption[];
    onBuildingChange: (buildingId: string) => void;
}

interface IconProps {
    className: string;
}

function sortFloors(floors: string[]) {
    return [...floors].sort((left, right) => {
        const floorOrder = (value: string) => {
            if (value.toLowerCase().includes('ground')) {
                return 0;
            }

            const match = value.match(/(\d+)/);
            return match ? parseInt(match[1], 10) : 999;
        };

        return floorOrder(left) - floorOrder(right);
    });
}

function getRoomTypeBadgeLetter(roomType?: string) {
    switch (roomType) {
        case 'Conference Room':
            return 'C';
        case 'Glass Room':
            return 'G';
        case 'Classroom':
            return 'R';
        case 'Specialized Room':
            return 'S';
        case 'Gymnasium':
            return 'Y';
        default:
            return 'R';
    }
}

function PlusIcon({ className }: Readonly<IconProps>) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14m7-7H5" />
        </svg>
    );
}

function SearchIcon({ className }: Readonly<IconProps>) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
    );
}

function PencilIcon({ className }: Readonly<IconProps>) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.862 4.487l1.688-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 7.125L16.875 4.5" />
        </svg>
    );
}

function TrashIcon({ className }: Readonly<IconProps>) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166M19.228 5.79L18.16 19.673A2.25 2.25 0 0115.916 21H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .563c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916A2.25 2.25 0 0013.5 2.25h-3A2.25 2.25 0 008.25 4.5v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
        </svg>
    );
}

export default function AdminManageRoomsTab({
    activeBuildingLabel,
    buildingFloors,
    buildingId,
    buildingName,
    managedBuildings,
    onBuildingChange,
}: Readonly<AdminManageRoomsTabProps>) {
    const [addRoomStep, setAddRoomStep] = useState(0);
    const [newRoomName, setNewRoomName] = useState('');
    const [newRoomFloor, setNewRoomFloor] = useState('');
    const [newRoomCapacity, setNewRoomCapacity] = useState('');
    const [newRoomType, setNewRoomType] = useState('');
    const [newRoomAcStatus, setNewRoomAcStatus] = useState('');
    const [newRoomTvStatus, setNewRoomTvStatus] = useState('');
    const [newRoomBeaconId, setNewRoomBeaconId] = useState('');
    const [addingRoom, setAddingRoom] = useState(false);

    const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [editFloor, setEditFloor] = useState('');
    const [editCapacity, setEditCapacity] = useState('');
    const [editRoomType, setEditRoomType] = useState('');
    const [editAcStatus, setEditAcStatus] = useState('');
    const [editTvStatus, setEditTvStatus] = useState('');
    const [editBeaconId, setEditBeaconId] = useState('');
    const [savingRoomId, setSavingRoomId] = useState<string | null>(null);
    const [deletingRoomId, setDeletingRoomId] = useState<string | null>(null);

    const [roomSearch, setRoomSearch] = useState('');
    const [roomFloorFilter, setRoomFloorFilter] = useState('');
    const [rooms, setRooms] = useState<Room[]>([]);
    const [roomCounts, setRoomCounts] = useState<RoomCountSummary>(EMPTY_ROOM_COUNTS);
    const [roomsLoading, setRoomsLoading] = useState(true);
    const [roomLoadError, setRoomLoadError] = useState('');
    const [roomReloadKey, setRoomReloadKey] = useState(0);

    const floorOptions = useMemo(
        () =>
            getBuildingFloorOptions({
                id: buildingId,
                name: buildingName,
                floors: buildingFloors,
            }),
        [buildingFloors, buildingId, buildingName]
    );
    const roomFloorOptions = useMemo(
        () => sortFloors(floorOptions.map((floorOption) => floorOption.value)),
        [floorOptions]
    );
    const hasAnyRooms = roomCounts.total > 0;
    const filteredRooms = useMemo(
        () =>
            rooms.filter((room) => {
                if (roomFloorFilter !== 'all' && room.floor !== roomFloorFilter) {
                    return false;
                }

                if (roomSearch && !room.name.toLowerCase().includes(roomSearch.toLowerCase())) {
                    return false;
                }

                return true;
            }),
        [roomFloorFilter, roomSearch, rooms]
    );

    useEffect(() => {
        setRoomFloorFilter(getPreferredDefaultFloorValue(floorOptions));
        setRoomSearch('');
        setRooms([]);
        setRoomCounts(EMPTY_ROOM_COUNTS);
    }, [buildingId, floorOptions]);

    useEffect(() => {
        let cancelled = false;

        if (!buildingId) {
            setRooms([]);
            setRoomCounts(EMPTY_ROOM_COUNTS);
            return () => {
                cancelled = true;
            };
        }

        setRooms([]);
        setRoomsLoading(true);
        setRoomLoadError('');

        const roomsRequest =
            roomFloorFilter === 'all'
                ? getRoomsByBuilding(buildingId)
                : getRoomsByBuildingAndFloor(buildingId, roomFloorFilter);

        void Promise.all([
            getRoomCountsByBuilding(buildingId, roomFloorOptions),
            roomsRequest,
        ])
            .then(([nextRoomCounts, nextRooms]) => {
                if (cancelled) {
                    return;
                }

                setRoomCounts(nextRoomCounts);
                setRooms(nextRooms);
            })
            .catch((error) => {
                if (cancelled) {
                    return;
                }

                console.warn('Failed to load rooms:', error);
                setRoomCounts(EMPTY_ROOM_COUNTS);
                setRooms([]);
                setRoomLoadError(error instanceof Error ? error.message : 'Failed to load rooms.');
            })
            .finally(() => {
                if (!cancelled) {
                    setRoomsLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [buildingId, roomFloorFilter, roomFloorOptions, roomReloadKey]);

    const reloadRoomData = () => {
        setRoomReloadKey((currentKey) => currentKey + 1);
    };

    const resetAddRoomWizard = () => {
        setAddRoomStep(0);
        setNewRoomName('');
        setNewRoomFloor('');
        setNewRoomCapacity('');
        setNewRoomType('');
        setNewRoomAcStatus('');
        setNewRoomTvStatus('');
        setNewRoomBeaconId('');
    };

    const resetEditRoomForm = () => {
        setEditingRoomId(null);
        setEditName('');
        setEditFloor('');
        setEditCapacity('');
        setEditRoomType('');
        setEditAcStatus('');
        setEditTvStatus('');
        setEditBeaconId('');
    };

    const startEditingRoom = (room: Room) => {
        setEditingRoomId(room.id);
        setEditName(room.name);
        setEditFloor(room.floor);
        setEditCapacity(String(room.capacity));
        setEditRoomType(room.roomType || '');
        setEditAcStatus(room.acStatus || 'No Air Conditioning');
        setEditTvStatus(room.tvProjectorStatus || 'No Television or Projector');
        setEditBeaconId(room.beaconId || '');
    };

    const handleAddRoomBuildingChange = (nextBuildingId: string) => {
        if (!nextBuildingId || nextBuildingId === buildingId) {
            return;
        }

        onBuildingChange(nextBuildingId);
        setNewRoomFloor('');

        if (addRoomStep === 2) {
            setAddRoomStep(1);
        }
    };

    const handleAddRoom = async () => {
        if (!buildingId || !buildingName || !newRoomName.trim() || !newRoomFloor.trim() || !newRoomType) {
            return;
        }

        setAddingRoom(true);

        try {
            const data: RoomInput = {
                name: newRoomName.trim(),
                floor: newRoomFloor.trim(),
                roomType: newRoomType,
                acStatus: newRoomAcStatus || 'No Air Conditioning',
                tvProjectorStatus: newRoomTvStatus || 'No Television or Projector',
                capacity: parseInt(newRoomCapacity, 10) || 30,
                status: 'Available',
                buildingId,
                buildingName,
                beaconId: newRoomBeaconId.trim() || null,
            };

            await addRoom(data);
            resetAddRoomWizard();
            reloadRoomData();
        } catch (error) {
            console.warn('Failed to add room:', error);
        } finally {
            setAddingRoom(false);
        }
    };

    const handleEditRoom = async (roomId: string) => {
        if (!editName.trim() || !editFloor.trim() || !editRoomType) {
            return;
        }

        setSavingRoomId(roomId);

        try {
            await updateRoom(roomId, {
                name: editName.trim(),
                floor: editFloor.trim(),
                roomType: editRoomType,
                acStatus: editAcStatus || 'No Air Conditioning',
                tvProjectorStatus: editTvStatus || 'No Television or Projector',
                capacity: parseInt(editCapacity, 10) || 30,
                beaconId: editBeaconId.trim() || null,
            });
            resetEditRoomForm();
            reloadRoomData();
        } catch (error) {
            console.warn('Failed to update room:', error);
            alert('Failed to update room. Please try again.');
        } finally {
            setSavingRoomId(null);
        }
    };

    const handleDeleteRoom = async (roomId: string) => {
        if (!confirm('Are you sure you want to delete this room?')) {
            return;
        }

        setDeletingRoomId(roomId);

        try {
            await deleteRoom(roomId);
            if (editingRoomId === roomId) {
                resetEditRoomForm();
            }
            reloadRoomData();
        } catch (error) {
            console.warn('Failed to delete:', error);
            alert(error instanceof Error ? error.message : 'Failed to delete room. Please try again.');
        } finally {
            setDeletingRoomId(null);
        }
    };

    return (
        <div className="space-y-5">
            <div className="flex flex-col gap-3 rounded-2xl border border-white/35 bg-white/75 px-6 py-4 shadow-[0_24px_60px_rgba(15,23,42,0.17)] backdrop-blur-xl transition-all duration-300 hover:bg-white/85 hover:shadow-2xl sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
                    <h3 className="text-xl font-bold text-gray-800">Manage Rooms</h3>
                    <button
                        onClick={() => setAddRoomStep(1)}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#a12124] px-4 py-1 text-sm font-bold text-white shadow-sm transition-all hover:bg-[#8f1c1f] hover:shadow-md sm:order-1"
                    >
                        <PlusIcon className="h-4 w-4" />
                        New Room
                    </button>
                </div>
                <div className="flex w-full flex-col gap-3 sm:ml-auto sm:w-auto sm:flex-row sm:items-center sm:justify-end">
                    {managedBuildings.length > 1 ? (
                        <div className="w-full sm:order-2 sm:w-72">
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
                        <div className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[#a12124]/30 bg-[#a12124]/10 px-3 py-1 text-xs font-bold text-[#7f1d1d] shadow-sm sm:order-2 sm:self-center sm:justify-end">
                            <span>Active Building: {activeBuildingLabel}</span>
                        </div>
                    )}
                </div>
            </div>

            {hasAnyRooms && (
                <div className="flex flex-col gap-3 rounded-2xl border border-white/35 bg-white/70 p-3 shadow-lg backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
                    <div className="relative sm:w-1/2">
                        <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-black/50" />
                        <input
                            type="text"
                            value={roomSearch}
                            onChange={(event) => setRoomSearch(event.target.value)}
                            placeholder="Search rooms by name..."
                            className="glass-input w-full pl-10 pr-4 py-2.5 text-sm"
                        />
                    </div>

                    <div className="flex w-full items-center gap-2 sm:w-auto sm:justify-end">
                        <AdminFloorFilter
                            label="Filter by Floor:"
                            options={[
                                ...floorOptions,
                                { value: 'all', label: 'All Floors' },
                            ]}
                            value={roomFloorFilter}
                            onChange={setRoomFloorFilter}
                            menuAlign="right"
                        />
                    </div>
                </div>
            )}

            {addRoomStep === 1 && (
                <div className="glass-card p-6 mb-8 !rounded-2xl">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h4 className="text-lg font-bold text-black">Select Floor</h4>
                            <p className="text-xs text-black mt-0.5">Step 1 of 2 - Choose which floor the room is on</p>
                        </div>
                        <button
                            onClick={resetAddRoomWizard}
                            className="p-2 rounded-lg text-black hover:text-primary hover:bg-primary/10 transition-all"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                    <div className="flex gap-2 mb-6">
                        <div className="h-1 flex-1 rounded-full bg-primary" />
                        <div className="h-1 flex-1 rounded-full bg-dark/10" />
                    </div>
                    <div className="mb-6">
                        <label className="block text-xs font-bold text-black mb-1.5">Building</label>
                        {managedBuildings.length > 1 ? (
                            <select
                                value={buildingId}
                                onChange={(event) => handleAddRoomBuildingChange(event.target.value)}
                                className="glass-input w-full px-4 py-2.5 text-sm appearance-none cursor-pointer"
                            >
                                {managedBuildings.map((building) => (
                                    <option key={building.id} value={building.id}>
                                        {getManagedBuildingOptionLabel(building)}
                                    </option>
                                ))}
                            </select>
                        ) : (
                            <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
                                <p className="text-sm font-bold text-black">{activeBuildingLabel}</p>
                                {buildingName && activeBuildingLabel !== buildingName ? (
                                    <p className="mt-1 text-xs text-black">{buildingName}</p>
                                ) : null}
                            </div>
                        )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {floorOptions.map((floorOption, index) => (
                            <button
                                key={floorOption.value}
                                onClick={() => {
                                    setNewRoomFloor(floorOption.value);
                                    setAddRoomStep(2);
                                }}
                                className="glass-card !bg-dark/5 p-4 !rounded-xl text-center group hover:!border-primary/40 transition-all cursor-pointer"
                            >
                                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-2">
                                    <span className="text-primary font-bold text-sm">
                                        {floorOption.label === 'Basement Floor'
                                            ? 'B'
                                            : floorOption.label === 'Ground Floor'
                                                ? 'G'
                                                : floorOption.label.match(/(\d+)/)?.[1] ?? index}
                                    </span>
                                </div>
                                <p className="text-sm font-bold text-black group-hover:text-primary transition-colors">
                                    {floorOption.label}
                                </p>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {addRoomStep === 2 && (
                <div className="glass-card p-6 mb-8 !rounded-2xl">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h4 className="text-lg font-bold text-black">Room Information</h4>
                            <p className="text-xs text-black mt-0.5">
                  Step 2 of 2 - <span className="text-primary">{getFloorDisplayLabel(newRoomFloor, {
                    id: buildingId,
                    name: buildingName
                  })}</span>
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setAddRoomStep(1)}
                                className="p-2 rounded-lg text-black hover:text-primary hover:bg-primary/10 transition-all"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                </svg>
                            </button>
                            <button
                                onClick={resetAddRoomWizard}
                                className="p-2 rounded-lg text-black hover:text-primary hover:bg-primary/10 transition-all"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div className="flex gap-2 mb-6">
                        <div className="h-1 flex-1 rounded-full bg-primary" />
                        <div className="h-1 flex-1 rounded-full bg-primary" />
                    </div>

                    <div className="space-y-6">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-black mb-1.5">Room Name *</label>
                                <input
                                    type="text"
                                    value={newRoomName}
                                    onChange={(event) => setNewRoomName(event.target.value)}
                                    placeholder="e.g. Room 312 or GD3 506"
                                    className="glass-input w-full px-4 py-2.5 text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-black mb-1.5">Room Type *</label>
                                <select
                                    value={newRoomType}
                                    onChange={(event) => setNewRoomType(event.target.value)}
                                    className="glass-input w-full px-4 py-2.5 text-sm appearance-none cursor-pointer"
                                >
                                    <option value="" disabled>Select room type</option>
                                    {ROOM_TYPE_OPTIONS.map((option) => (
                                        <option key={option} value={option}>
                                            {ROOM_TYPE_LABELS[option]}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-black mb-1.5">Beacon ID (building-room-beacon)</label>
                            <input
                                type="text"
                                value={newRoomBeaconId}
                                onChange={(event) => setNewRoomBeaconId(event.target.value)}
                                placeholder="e.g. dc-312-beacon or gd3-506-beacon"
                                className="glass-input w-full px-4 py-2.5 text-sm"
                            />
                            <p className="mt-1.5 text-xs text-black">
                                Use the exact ESP32 BLE device name for Bluetooth room check-in. Not required for all rooms.
                            </p>
                        </div>

                        <div>
                            <h5 className="text-sm font-bold text-black uppercase tracking-wider mb-4">Facilities</h5>

                            <div className="mb-4">
                                <label className="block text-xs font-bold text-black mb-2">Air Conditioner Status</label>
                                <div className="flex flex-wrap gap-2">
                                    {ROOM_AC_OPTIONS.map((option) => (
                                        <button
                                            key={option}
                                            type="button"
                                            onClick={() => setNewRoomAcStatus(option)}
                                            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${newRoomAcStatus === option
                                                    ? 'bg-primary/20 text-primary border border-primary/40'
                                                    : 'bg-dark/5 text-black border border-dark/10 hover:bg-primary/10 hover:text-primary'
                                                }`}
                                        >
                                            {option}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="mb-4">
                                <label className="block text-xs font-bold text-black mb-2">Television or Projector</label>
                                <div className="flex flex-wrap gap-2">
                                    {ROOM_DISPLAY_OPTIONS.map((option) => (
                                        <button
                                            key={option}
                                            type="button"
                                            onClick={() => setNewRoomTvStatus(option)}
                                            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${newRoomTvStatus === option
                                                    ? 'bg-primary/20 text-primary border border-primary/40'
                                                    : 'bg-dark/5 text-black border border-dark/10 hover:bg-primary/10 hover:text-primary'
                                                }`}
                                        >
                                            {option}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-black mb-1.5">Maximum Capacity</label>
                                <input
                                    type="number"
                                    value={newRoomCapacity}
                                    onChange={(event) => setNewRoomCapacity(event.target.value)}
                                    placeholder="30"
                                    className="glass-input w-full sm:w-40 px-4 py-2.5 text-sm"
                                    min={1}
                                />
                            </div>
                        </div>

                        <button
                            onClick={handleAddRoom}
                            disabled={addingRoom || !newRoomName.trim() || !newRoomType}
                            className="btn-primary w-full py-3 px-4 text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {addingRoom ? 'Adding Room...' : 'Add Room'}
                        </button>
                    </div>
                </div>
            )}

            {roomsLoading && rooms.length === 0 && addRoomStep === 0 ? (
                <div className="glass-card p-12 text-center">
                    <h4 className="text-lg font-bold text-black mb-1">Loading rooms...</h4>
                    <p className="text-sm text-black">Fetching rooms for the selected floor.</p>
                </div>
            ) : roomLoadError && addRoomStep === 0 ? (
                <div className="glass-card p-12 text-center">
                    <h4 className="text-lg font-bold text-black mb-1">Unable to Load Rooms</h4>
                    <p className="text-sm text-black">{roomLoadError}</p>
                </div>
            ) : !hasAnyRooms && addRoomStep === 0 ? (
                <div className="glass-card p-12 text-center">
                    <div className="text-4xl mb-3">Rooms</div>
                    <h4 className="text-lg font-bold text-black mb-1">No Rooms Yet</h4>
                    <p className="text-sm text-black">Click &quot;New Room&quot; above to add your first room.</p>
                </div>
            ) : filteredRooms.length === 0 && hasAnyRooms ? (
                <div className="glass-card p-8 text-center">
                    <div className="text-3xl mb-3">Search</div>
                    <h4 className="text-lg font-bold text-black mb-1">No Rooms Found</h4>
                    <p className="text-sm text-black">Try adjusting your search or filter.</p>
                </div>
            ) : filteredRooms.length > 0 ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {filteredRooms.map((room) => (
                        <div
                            key={room.id}
                            className={`rounded-2xl border border-white/70 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg sm:p-5 ${editingRoomId === room.id ? 'md:col-span-2 xl:col-span-3' : ''
                                }`}
                        >
                            {editingRoomId === room.id ? (
                                <div className="space-y-5">
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                        <div>
                                            <label className="mb-1.5 block text-xs font-bold text-black">Room Name *</label>
                                            <input
                                                type="text"
                                                value={editName}
                                                onChange={(event) => setEditName(event.target.value)}
                                                className="glass-input w-full px-4 py-2.5 text-sm"
                                                placeholder="e.g. Room 312"
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-1.5 block text-xs font-bold text-black">Floor *</label>
                                            <select
                                                value={editFloor}
                                                onChange={(event) => setEditFloor(event.target.value)}
                                                className="glass-input w-full cursor-pointer appearance-none px-4 py-2.5 text-sm"
                                            >
                                                <option value="" disabled>Select floor</option>
                                                {floorOptions.map((floorOption) => (
                                                    <option key={floorOption.value} value={floorOption.value}>
                                                        {floorOption.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="sm:col-span-2">
                                            <label className="mb-1.5 block text-xs font-bold text-black">Room Type *</label>
                                            <select
                                                value={editRoomType}
                                                onChange={(event) => setEditRoomType(event.target.value)}
                                                className="glass-input w-full cursor-pointer appearance-none px-4 py-2.5 text-sm"
                                            >
                                                <option value="" disabled>Select room type</option>
                                                {ROOM_TYPE_OPTIONS.map((option) => (
                                                    <option key={option} value={option}>
                                                        {ROOM_TYPE_LABELS[option]}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="sm:col-span-2">
                                            <label className="mb-1.5 block text-xs font-bold text-black">Beacon ID</label>
                                            <input
                                                type="text"
                                                value={editBeaconId}
                                                onChange={(event) => setEditBeaconId(event.target.value)}
                                                className="glass-input w-full px-4 py-2.5 text-sm"
                                                placeholder="e.g. ESP32_ROOM_301"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <h5 className="mb-4 text-sm font-bold uppercase tracking-wider text-black">Facilities</h5>
                                        <div className="mb-4">
                                            <label className="mb-2 block text-xs font-bold text-black">Air Conditioner Status</label>
                                            <div className="flex flex-wrap gap-2">
                                                {ROOM_AC_OPTIONS.map((option) => (
                                                    <button
                                                        key={option}
                                                        type="button"
                                                        onClick={() => setEditAcStatus(option)}
                                                        className={`rounded-xl px-4 py-2 text-sm font-bold transition-all ${editAcStatus === option
                                                                ? 'border border-primary/40 bg-primary/20 text-primary'
                                                                : 'border border-dark/10 bg-dark/5 text-black hover:bg-primary/10 hover:text-primary'
                                                            }`}
                                                    >
                                                        {option}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="mb-4">
                                            <label className="mb-2 block text-xs font-bold text-black">Television or Projector</label>
                                            <div className="flex flex-wrap gap-2">
                                                {ROOM_DISPLAY_OPTIONS.map((option) => (
                                                    <button
                                                        key={option}
                                                        type="button"
                                                        onClick={() => setEditTvStatus(option)}
                                                        className={`rounded-xl px-4 py-2 text-sm font-bold transition-all ${editTvStatus === option
                                                                ? 'border border-primary/40 bg-primary/20 text-primary'
                                                                : 'border border-dark/10 bg-dark/5 text-black hover:bg-primary/10 hover:text-primary'
                                                            }`}
                                                    >
                                                        {option}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <label className="mb-1.5 block text-xs font-bold text-black">Maximum Capacity</label>
                                            <input
                                                type="number"
                                                value={editCapacity}
                                                onChange={(event) => setEditCapacity(event.target.value)}
                                                className="glass-input w-full px-4 py-2.5 text-sm sm:w-40"
                                                placeholder="30"
                                                min={1}
                                            />
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            onClick={() => handleEditRoom(room.id)}
                                            disabled={
                                                savingRoomId === room.id ||
                                                !editName.trim() ||
                                                !editFloor.trim() ||
                                                !editRoomType
                                            }
                                            className="px-4 py-2 rounded-xl text-sm font-bold ui-button-green"
                                        >
                                            {savingRoomId === room.id ? 'Saving...' : 'Save Changes'}
                                        </button>
                                        <button
                                            onClick={resetEditRoomForm}
                                            disabled={savingRoomId === room.id}
                                            className="px-4 py-2 rounded-xl text-sm font-bold bg-dark/5 text-black border border-dark/10 hover:bg-primary/10 transition-all"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex min-h-40 flex-col justify-between gap-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex min-w-0 flex-1 items-start gap-3">
                                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-lg font-bold text-primary">
                                                {getRoomTypeBadgeLetter(room.roomType)}
                                            </div>
                                            <div className="min-w-0 flex-1 pt-0.5">
                                                <h4 className="truncate text-lg font-bold leading-tight text-black">{room.name}</h4>
                                                <div className="mt-2 space-y-1 text-xs font-medium leading-4 text-black/60">
                                                    <p>{getFloorDisplayLabel(room.floor, {
                                                        id: room.buildingId,
                                                        name: room.buildingName,
                                                    })}</p>
                                                    <p>{room.roomType || 'Room'}</p>
                                                    <p>Maximum Capacity: {room.capacity}</p>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="shrink-0">
                                            <StatusBadge status={room.status} />
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-3">
                                        <button
                                            type="button"
                                            onClick={() => startEditingRoom(room)}
                                            disabled={deletingRoomId === room.id}
                                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 transition-all hover:border-[#a12124]/30 hover:bg-[#a12124]/5 hover:text-[#a12124] disabled:cursor-not-allowed disabled:opacity-60"
                                            title={`Edit ${room.name}`}
                                            aria-label={`Edit ${room.name}`}
                                        >
                                            <PencilIcon className="h-4 w-4" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteRoom(room.id)}
                                            disabled={deletingRoomId === room.id}
                                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-white text-red-700 transition-all hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                                            title={`Delete ${room.name}`}
                                            aria-label={`Delete ${room.name}`}
                                        >
                                            <TrashIcon className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    );
}
