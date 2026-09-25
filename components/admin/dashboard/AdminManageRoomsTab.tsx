'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import AdminBuildingSelect from '@/components/admin/AdminBuildingSelect';
import AdminFloorFilter from '@/components/admin/AdminFloorFilter';
import AdminRoomScheduleModal from '@/components/admin/dashboard/AdminRoomScheduleModal';
import {
    getBuildingFloorOptions,
    getFloorDisplayLabel,
    getPreferredDefaultFloorValue,
} from '@/lib/buildings/floorLabels';
import {
    addFloor,
    deleteFloor,
    getFloorsByBuilding,
    type Floor,
    updateFloor,
} from '@/lib/buildings/floors';
import { getNextSequentialFloorName } from '@/lib/buildings/floorNames';
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
import type { Reservation } from '@/lib/reservations/reservations';
import {
    DEFAULT_RESERVATION_TIME_ZONE,
    getCurrentDateTimeStringInTimeZone,
} from '@/lib/rooms/roomStatus';
import type { Schedule } from '@/lib/schedules/schedules';
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
    showRoomIdentifiers?: boolean;
    activeBuildingLabel: string;
    buildingFloors: number;
    buildingId: string;
    buildingName: string;
    managedBuildings: BuildingOption[];
    onBuildingChange: (buildingId: string) => void;
    allReservations: Reservation[];
    schedules: Schedule[];
}

interface IconProps {
    className: string;
}

function sortFloors(floors: string[]) {
    return [...floors].sort((left, right) => {
        const floorOrder = (value: string) => {
            const normalizedValue = value.toLowerCase();
            if (normalizedValue.includes('basement')) {
                return -1;
            }

            if (normalizedValue.includes('ground')) {
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

function getRecommendedBeaconRssiThreshold(capacity: string | number) {
    const parsedCapacity = Number(capacity);
    const normalizedCapacity = Number.isFinite(parsedCapacity) && parsedCapacity > 0
        ? parsedCapacity
        : 30;
    const recommendedThreshold = Math.round(-75 - ((normalizedCapacity - 30) / 10) * 2);
    return Math.min(-70, Math.max(-85, recommendedThreshold));
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

function FloorTrashIcon({ className }: Readonly<IconProps>) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166M19.228 5.79L18.16 19.673A2.25 2.25 0 0115.916 21H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .563c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916A2.25 2.25 0 0013.5 2.25h-3A2.25 0 008.25 4.5v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
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
    showRoomIdentifiers = false,
    allReservations,
    activeBuildingLabel,
    buildingFloors,
    buildingId,
    buildingName,
    managedBuildings,
    onBuildingChange,
    schedules,
}: Readonly<AdminManageRoomsTabProps>) {
    const editingRoomContainerRef = useRef<HTMLDivElement>(null);
    const now = new Date();
    const today = getCurrentDateTimeStringInTimeZone(now, DEFAULT_RESERVATION_TIME_ZONE).date;
    const todayWeekday = new Intl.DateTimeFormat('en-US', {
        timeZone: DEFAULT_RESERVATION_TIME_ZONE,
        weekday: 'short',
    }).format(now);
    const todayDayOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(todayWeekday);
    const getRoomBadgeStatus = (room: Room) => {
        if (room.status === 'Unavailable') return 'Unavailable';

        const hasClassToday = schedules.some(
            (schedule) =>
                schedule.roomId === room.id &&
                schedule.dayOfWeek === todayDayOfWeek &&
                Boolean(schedule.startTime) &&
                Boolean(schedule.endTime) &&
                schedule.startTime < schedule.endTime
        );
        const hasApprovedReservationToday = allReservations.some(
            (reservation) =>
                reservation.roomId === room.id &&
                reservation.status === 'approved' &&
                reservation.date === today &&
                Boolean(reservation.startTime) &&
                Boolean(reservation.endTime) &&
                reservation.startTime < reservation.endTime
        );

        if (hasClassToday || hasApprovedReservationToday) return 'Reserved';
        return room.status === 'Occupied' ? 'Occupied' : 'Available';
    };

    const [addingFloor, setAddingFloor] = useState(false);
    const [managingFloors, setManagingFloors] = useState(false);
    const [editingFloorName, setEditingFloorName] = useState<string | null>(null);
    const [editedFloorName, setEditedFloorName] = useState('');
    const [savingFloorName, setSavingFloorName] = useState<string | null>(null);
    const [floors, setFloors] = useState<Floor[]>([]);
    const [floorLoadError, setFloorLoadError] = useState('');
    const [floorActionError, setFloorActionError] = useState('');
    const [floorReloadKey, setFloorReloadKey] = useState(0);

    const [addRoomStep, setAddRoomStep] = useState(0);
    const [newRoomName, setNewRoomName] = useState('');
    const [newRoomFloor, setNewRoomFloor] = useState('');
    const [newRoomCapacity, setNewRoomCapacity] = useState('');
    const [newRoomType, setNewRoomType] = useState('');
    const [newRoomAcStatus, setNewRoomAcStatus] = useState('');
    const [newRoomTvStatus, setNewRoomTvStatus] = useState('');
    const [newRoomBeaconId, setNewRoomBeaconId] = useState('');
    const [newRoomRssiThreshold, setNewRoomRssiThreshold] = useState('-75');
    const [newRoomId, setNewRoomId] = useState('');
    const [addingRoom, setAddingRoom] = useState(false);

    // Generate room ID based on building, floor, and name when available
    const computedRoomId = useMemo(() => {
        if (buildingId && newRoomFloor && newRoomName) {
            // Create a simple ID based on the inputs
            // Format: buildingCode-floorName-roomName (simplified)
            const buildingCode = buildingId.toLowerCase().replace(/[^a-z0-9]/g, '');
            const floorCode = newRoomFloor.toLowerCase().replace(/[^a-z0-9]/g, '-');
            const nameCode = newRoomName.toLowerCase().replace(/[^a-z0-9]/g, '-');
            return `${buildingCode}-${floorCode}-${nameCode}`.replace(/-+/g, '-').replace(/^-|-$/g, '');
        }
        return '';
    }, [buildingId, newRoomFloor, newRoomName]);

    const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [editFloor, setEditFloor] = useState('');
    const [editCapacity, setEditCapacity] = useState('');
    const [editRoomType, setEditRoomType] = useState('');
    const [editAcStatus, setEditAcStatus] = useState('');
    const [editTvStatus, setEditTvStatus] = useState('');
    const [editBeaconId, setEditBeaconId] = useState('');
    const [editRssiThreshold, setEditRssiThreshold] = useState('-75');
    const [savingRoomId, setSavingRoomId] = useState<string | null>(null);
    const [deletingRoomId, setDeletingRoomId] = useState<string | null>(null);
    const [scheduleRoom, setScheduleRoom] = useState<Room | null>(null);
    const [copyToast, setCopyToast] = useState('');
    const [beaconPromptRoom, setBeaconPromptRoom] = useState<Room | null>(null);
    const [beaconPromptValue, setBeaconPromptValue] = useState('');
    const [beaconPromptError, setBeaconPromptError] = useState('');
    const [savingBeaconPrompt, setSavingBeaconPrompt] = useState(false);

    const [roomSearch, setRoomSearch] = useState('');
    const [roomFloorFilter, setRoomFloorFilter] = useState('');
    const [beaconScriptSsid, setBeaconScriptSsid] = useState('St. Dominic College of Asia');
    const [beaconScriptPassword, setBeaconScriptPassword] = useState('');
    const [rooms, setRooms] = useState<Room[]>([]);
    const [roomCounts, setRoomCounts] = useState<RoomCountSummary>(EMPTY_ROOM_COUNTS);
    const [roomsLoading, setRoomsLoading] = useState(true);
    const [roomLoadError, setRoomLoadError] = useState('');
    const [roomReloadKey, setRoomReloadKey] = useState(0);

    useEffect(() => {
        if (!copyToast) return;
        const timeoutId = window.setTimeout(() => setCopyToast(''), 2400);
        return () => window.clearTimeout(timeoutId);
    }, [copyToast]);

    useEffect(() => {
        if (!editingRoomId) return;
        const frameId = window.requestAnimationFrame(() => {
            editingRoomContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        return () => window.cancelAnimationFrame(frameId);
    }, [editingRoomId]);

    const legacyFloorOptions = useMemo(
        () =>
            getBuildingFloorOptions({
                id: buildingId,
                name: buildingName,
                floors: buildingFloors,
            }),
        [buildingFloors, buildingId, buildingName]
    );
    const primaryFloorOptions = useMemo(
        () => {
            const uniqueFloors = new Map<string, string>();
            const hiddenFloorNames = new Set(
                floors
                    .filter((floor) => floor.hidden)
                    .map((floor) => (floor.replacesName ?? floor.name).trim().toLowerCase())
            );

            [
                ...legacyFloorOptions
                    .map((floor) => floor.value)
                    .filter((floorName) => !hiddenFloorNames.has(floorName.trim().toLowerCase())),
                ...floors.filter((floor) => !floor.hidden).map((floor) => floor.name),
            ]
                .forEach((floorName) => {
                    const normalizedName = floorName.trim().toLowerCase();
                    if (normalizedName) {
                        uniqueFloors.set(normalizedName, floorName);
                    }
                });

            return sortFloors([...uniqueFloors.values()]).map((floor) => ({
                label: floor,
                value: floor,
            }));
        },
        [floors, legacyFloorOptions]
    );
    const legacyRoomFloorOptions = useMemo(() => {
        const knownValues = new Set(primaryFloorOptions.map((floorOption) => floorOption.value));
        const legacyFloorValues = rooms
            .map((room) => room.floor.trim())
            .filter((floor) => floor && !knownValues.has(floor));

        return sortFloors([...new Set(legacyFloorValues)]).map((floor) => ({
            label: floor,
            value: floor,
        }));
    }, [primaryFloorOptions, rooms]);
    const floorOptions = useMemo(
        () =>
            sortFloors([
                ...primaryFloorOptions.map((floorOption) => floorOption.value),
                ...legacyRoomFloorOptions.map((floorOption) => floorOption.value),
            ]).map((floor) => ({ label: floor, value: floor })),
        [legacyRoomFloorOptions, primaryFloorOptions]
    );
    const roomFloorOptions = useMemo(
        () => primaryFloorOptions.map((floorOption) => floorOption.value),
        [primaryFloorOptions]
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
        let cancelled = false;

        setFloors([]);
        setFloorLoadError('');
        setFloorActionError('');

        if (!buildingId) {
            return () => {
                cancelled = true;
            };
        }

        void getFloorsByBuilding(buildingId)
            .then((nextFloors) => {
                if (!cancelled) {
                    setFloors(nextFloors);
                }
            })
            .catch((error) => {
                if (!cancelled) {
                    setFloors([]);
                    setFloorLoadError(error instanceof Error ? error.message : 'Failed to load floors.');
                }
            });

        return () => {
            cancelled = true;
        };
    }, [buildingId, floorReloadKey]);

    useEffect(() => {
        const preferredFloor = getPreferredDefaultFloorValue(primaryFloorOptions);

        setRoomFloorFilter((currentFloor) => (currentFloor === preferredFloor ? currentFloor : preferredFloor));
        setRoomSearch((currentSearch) => (currentSearch === '' ? currentSearch : ''));
        setRooms((currentRooms) => (currentRooms.length === 0 ? currentRooms : []));
        setRoomCounts((currentCounts) => (
            currentCounts.total === 0 && currentCounts.floors.length === 0
                ? currentCounts
                : EMPTY_ROOM_COUNTS
        ));
    }, [buildingId, primaryFloorOptions]);

    useEffect(() => {
        let cancelled = false;

        if (!buildingId) {
            setRooms((currentRooms) => (currentRooms.length === 0 ? currentRooms : []));
            setRoomCounts((currentCounts) => (
                currentCounts.total === 0 && currentCounts.floors.length === 0
                    ? currentCounts
                    : EMPTY_ROOM_COUNTS
            ));
            return () => {
                cancelled = true;
            };
        }

        setRooms((currentRooms) => (currentRooms.length === 0 ? currentRooms : []));
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

    const reloadFloorData = () => {
        setFloorReloadKey((currentKey) => currentKey + 1);
    };

    const handleAddFloor = async () => {
        if (!buildingId) return;

        const nextFloorName = getNextSequentialFloorName(
            floorOptions.map((floorOption) => floorOption.value)
        );
        setAddingFloor(true);
        setFloorActionError('');

        try {
            await addFloor(buildingId, nextFloorName);
            reloadFloorData();
        } catch (error) {
            setFloorActionError(error instanceof Error ? error.message : 'Failed to add floor.');
        } finally {
            setAddingFloor(false);
        }
    };

    const getFloorRecord = (floorName: string) =>
        floors.find((floor) => !floor.hidden && floor.name === floorName);

    const ensureFloorRecord = async (floorName: string, floorId?: string) => {
        if (floorId) return floorId;
        const floor = await addFloor(buildingId, floorName);
        return floor.id;
    };

    const handleDeleteFloor = async (floorName: string, floorId?: string) => {
        if (!window.confirm(`Delete ${floorName}?`)) return;

        setSavingFloorName(floorName);
        setFloorActionError('');
        try {
            await deleteFloor(buildingId, await ensureFloorRecord(floorName, floorId));
            reloadFloorData();
        } catch (error) {
            setFloorActionError(error instanceof Error ? error.message : 'Failed to delete floor.');
        } finally {
            setSavingFloorName(null);
        }
    };

    const handleSaveFloor = async (floorName: string, floorId?: string) => {
        const nextFloorName = editedFloorName.trim();
        if (!nextFloorName || nextFloorName === floorName) {
            setEditingFloorName(null);
            return;
        }

        setSavingFloorName(floorName);
        setFloorActionError('');
        try {
            await updateFloor(buildingId, await ensureFloorRecord(floorName, floorId), nextFloorName);
            setEditingFloorName(null);
            reloadFloorData();
            reloadRoomData();
        } catch (error) {
            setFloorActionError(error instanceof Error ? error.message : 'Failed to rename floor.');
        } finally {
            setSavingFloorName(null);
        }
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
        setNewRoomRssiThreshold('-75');
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
        setEditRssiThreshold('-75');
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
        setEditRssiThreshold(String(room.beaconRssiThreshold ?? -75));
    };

    const copyToClipboard = async (value: string, label: string) => {
        try {
            await navigator.clipboard.writeText(value);
            setCopyToast(`${label} copied to clipboard`);
        } catch (error) {
            console.warn(`Failed to copy ${label}:`, error);
            setCopyToast(`Could not copy ${label}`);
        }
    };

    const getDefaultBeaconId = (room: Room) => {
        const rawBuildingId = room.buildingId.toLowerCase();
        const buildingPrefix = rawBuildingId.includes('gd1') || room.buildingName.toLowerCase().includes('gd1')
            ? 'gd1'
            : rawBuildingId.includes('gd2') || room.buildingName.toLowerCase().includes('gd2')
                ? 'gd2'
                : rawBuildingId.includes('gd3') || room.buildingName.toLowerCase().includes('gd3')
                    ? 'gd3'
                    : 'dc';
        const roomCode = room.name.toLowerCase().trim()
            .replace(/^(?:gd[123]?|room)\b\s*/i, '')
            .replace(/[^a-z0-9]+/g, '');
        return `${buildingPrefix}-${roomCode}-beacon`;
    };

    const copyRoomHardwareScript = async (room: Room, beaconId: string) => {
        try {
            const response = await fetch('/hardware/room-reserve.ino');
            if (!response.ok) throw new Error('Could not load hardware script');
            let script = await response.text();
            script = script
                .replace(/const char\* ssid\s*=\s*"[^"]*";/, `const char* ssid = ${JSON.stringify(beaconScriptSsid)};`)
                .replace(/const char\* password\s*=\s*"[^"]*";/, `const char* password = ${JSON.stringify(beaconScriptPassword)};`)
                .replace(/const char\* roomId\s*=\s*"[^"]*";/, `const char* roomId   = ${JSON.stringify(room.id)};`)
                .replace(/const char\* roomName\s*=\s*"[^"]*";/, `const char* roomName = ${JSON.stringify(room.name)};`)
                .replace(/const char\* beaconId\s*=\s*"[^"]*";/, `const char* beaconId = ${JSON.stringify(beaconId)};`);
            await navigator.clipboard.writeText(script);
            setCopyToast(`Hardware script for ${room.name} copied`);
        } catch (error) {
            console.warn('Failed to copy hardware script:', error);
            setCopyToast('Could not copy hardware script');
        }
    };

    const startCopyRoomScript = (room: Room) => {
        if (room.beaconId?.trim()) {
            void copyRoomHardwareScript(room, room.beaconId.trim());
            return;
        }
        setBeaconPromptRoom(room);
        setBeaconPromptValue(getDefaultBeaconId(room));
        setBeaconPromptError('');
    };

    const saveBeaconId = async (alsoCopyScript: boolean) => {
        if (!beaconPromptRoom || !beaconPromptValue.trim()) return;
        const room = beaconPromptRoom;
        const beaconId = beaconPromptValue.trim();
        setSavingBeaconPrompt(true);
        setBeaconPromptError('');
        try {
            await updateRoom(room.id, { beaconId });
            setRooms((currentRooms) => currentRooms.map((currentRoom) =>
                currentRoom.id === room.id ? { ...currentRoom, beaconId } : currentRoom
            ));
            setBeaconPromptRoom(null);
            if (alsoCopyScript) await copyRoomHardwareScript(room, beaconId);
        } catch (error) {
            console.warn('Failed to save room Beacon ID:', error);
            setBeaconPromptError('Could not save the Beacon ID. Please try again.');
        } finally {
            setSavingBeaconPrompt(false);
        }
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
                ...(showRoomIdentifiers ? {
                    beaconId: newRoomBeaconId.trim() || null,
                    beaconRssiThreshold: Number(newRoomRssiThreshold) || -75,
                } : {}),
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
            const updatedFields = {
                name: editName.trim(),
                floor: editFloor.trim(),
                roomType: editRoomType,
                acStatus: editAcStatus || 'No Air Conditioning',
                tvProjectorStatus: editTvStatus || 'No Television or Projector',
                capacity: parseInt(editCapacity, 10) || 30,
                ...(showRoomIdentifiers ? {
                    beaconId: editBeaconId.trim() || null,
                    beaconRssiThreshold: Number(editRssiThreshold) || -75,
                } : {}),
            };
            await updateRoom(roomId, updatedFields);
            setRooms((currentRooms) => currentRooms.map((room) =>
                room.id === roomId ? { ...room, ...updatedFields } : room
            ));
            void getRoomCountsByBuilding(buildingId, roomFloorOptions)
                .then(setRoomCounts)
                .catch((error) => console.warn('Failed to refresh room counts:', error));
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
            {copyToast ? <div role="status" className={`fixed right-6 top-24 z-[120] rounded-xl border px-4 py-3 text-sm font-bold shadow-lg ${copyToast.startsWith('Could not') ? 'border-red-200 bg-red-50 text-red-800' : 'border-green-200 bg-green-50 text-green-800'}`}>{copyToast}</div> : null}
            <div className="relative z-[60] flex flex-col gap-3 rounded-2xl border border-white/35 bg-white/75 px-6 py-4 shadow-[0_24px_60px_rgba(15,23,42,0.17)] backdrop-blur-xl transition-all duration-300 hover:bg-white/85 hover:shadow-2xl sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
                    <h3 className="text-xl font-bold text-gray-800">Manage Facilities</h3>
                    <button
                        onClick={() => setAddRoomStep(1)}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#a12124] px-4 py-1 text-sm font-bold text-white shadow-sm transition-all hover:bg-[#8f1c1f] hover:shadow-md sm:order-1"
                    >
                        <PlusIcon className="h-4 w-4" />
                        Add Room
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

            {hasAnyRooms && showRoomIdentifiers ? (
                <div className="flex flex-col gap-3 rounded-2xl border border-blue-200/70 bg-blue-50/80 p-3 shadow-sm sm:flex-row sm:items-center">
                    <span className="shrink-0 pl-1 text-sm !font-extrabold text-black" style={{ fontWeight: 800 }}>For Beacon Script:</span>
                    <input
                        type="text"
                        aria-label="Beacon script SSID"
                        placeholder="SSID"
                        value={beaconScriptSsid}
                        onChange={(event) => setBeaconScriptSsid(event.target.value)}
                        className="glass-input min-w-0 flex-1 px-4 py-2.5 text-sm"
                    />
                    <input
                        type="text"
                        aria-label="Beacon script password"
                        placeholder="Password"
                        value={beaconScriptPassword}
                        onChange={(event) => setBeaconScriptPassword(event.target.value)}
                        className="glass-input min-w-0 flex-1 px-4 py-2.5 text-sm"
                    />
                </div>
            ) : null}

            {scheduleRoom && (
                <AdminRoomScheduleModal
                    room={scheduleRoom}
                    onClose={() => setScheduleRoom(null)}
                />
            )}

            {addRoomStep === 1 && (
                <div className="glass-card p-6 mb-8 !rounded-2xl">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h4 className="text-lg font-bold text-black">Select Floor</h4>
                            <p className="text-xs text-black mt-0.5">Step 1 of 2 - Choose which floor the room is on</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setManagingFloors((current) => !current);
                                    setEditingFloorName(null);
                                    setFloorActionError('');
                                }}
                                className="rounded-lg border border-primary/40 bg-white/70 px-3 py-1.5 text-xs font-bold text-primary transition-all hover:bg-primary/10"
                            >
                                {managingFloors ? 'Done Managing' : 'Manage Floors'}
                            </button>
                            <button
                                onClick={resetAddRoomWizard}
                                className="p-2 rounded-lg text-black hover:text-primary hover:bg-primary/10 transition-all"
                                aria-label="Close floor selection"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
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
                    {floorLoadError || floorActionError ? (
                        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                            {floorActionError || floorLoadError}
                        </p>
                    ) : null}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {floorOptions.map((floorOption) => {
                            const floorRecord = getFloorRecord(floorOption.value);
                            const isEditing = editingFloorName === floorOption.value;
                            const isSaving = savingFloorName === floorOption.value;

                            return (
                            <div
                                key={floorOption.value}
                                className="glass-card relative !bg-dark/5 p-4 !rounded-xl text-center group hover:!border-primary/40 transition-all"
                            >
                                {managingFloors ? (
                                    <div className="absolute right-2 top-2 flex gap-1">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setEditingFloorName(floorOption.value);
                                                setEditedFloorName(floorOption.value);
                                            }}
                                            disabled={isSaving}
                                            className="rounded-md p-1 text-primary hover:bg-primary/10 disabled:opacity-50"
                                            aria-label={`Rename ${floorOption.label}`}
                                        >
                                            <PencilIcon className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void handleDeleteFloor(floorOption.value, floorRecord?.id)}
                                            disabled={isSaving}
                                            className="rounded-md p-1 text-red-700 hover:bg-red-50 disabled:opacity-50"
                                            aria-label={`Delete ${floorOption.label}`}
                                        >
                                            <FloorTrashIcon className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                ) : null}
                                {isEditing ? (
                                    <div className="space-y-2 pt-5">
                                        <input
                                            type="text"
                                            value={editedFloorName}
                                            onChange={(event) => setEditedFloorName(event.target.value)}
                                            onClick={(event) => event.stopPropagation()}
                                            className="glass-input w-full px-2 py-1.5 text-center text-sm"
                                            aria-label={`New name for ${floorOption.label}`}
                                            autoFocus
                                        />
                                        <div className="flex justify-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => void handleSaveFloor(floorOption.value, floorRecord?.id)}
                                                disabled={isSaving || !editedFloorName.trim()}
                                                className="rounded-md bg-primary px-2 py-1 text-xs font-bold text-white disabled:opacity-50"
                                            >
                                                Save
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setEditingFloorName(null)}
                                                disabled={isSaving}
                                                className="rounded-md px-2 py-1 text-xs font-bold text-black hover:bg-dark/10"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (!managingFloors) {
                                                setNewRoomFloor(floorOption.value);
                                                setAddRoomStep(2);
                                            }
                                        }}
                                        className="w-full"
                                        disabled={managingFloors}
                                    >
                                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-2">
                                            <span className="text-primary font-bold text-sm">
                                                {floorOption.label.trim().match(/^\d+/)?.[0] ?? floorOption.label.trim().charAt(0).toUpperCase()}
                                            </span>
                                        </div>
                                        <p className="text-sm font-bold text-black group-hover:text-primary transition-colors">
                                            {floorOption.label}
                                        </p>
                                    </button>
                                )}
                            </div>
                            );
                        })}
                        <button
                            type="button"
                            onClick={handleAddFloor}
                            disabled={addingFloor}
                            className="rounded-xl bg-[#a12124] p-4 text-center text-white shadow-sm transition-all hover:bg-[#8f1c1f] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-white/15">
                                <PlusIcon className="h-5 w-5" />
                            </div>
                            <p className="text-sm font-bold">
                                {addingFloor ? 'Adding Floor...' : 'Add Floor'}
                            </p>
                        </button>
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
                            {showRoomIdentifiers && <div className="sm:col-span-2">
                                <div className="flex w-full gap-4">
                                    <div className="flex-1 min-w-0">
                                        <label className="block text-xs font-bold text-black mb-1.5">Beacon ID (building-room-beacon)</label>
                                        <input
                                            type="text"
                                            value={newRoomBeaconId}
                                            onChange={(event) => setNewRoomBeaconId(event.target.value)}
                                            placeholder="e.g. dc-312-beacon or gd3-506-beacon"
                                            className="glass-input w-full px-4 py-2.5 text-sm"
                                        />
                                        <p className="mt-1.5 text-xs text-black">
                                            This will be used by the ESP32 BLE device for Bluetooth room check-in. Not required for all rooms.
                                        </p>
                                    </div>
                                </div>
                                <div className="mt-4 w-full">
                                    <label className="mb-1.5 block text-xs font-bold text-black">Beacon RSSI threshold (dBm)</label>
                                    <div className="flex w-full items-start gap-4">
                                        <div className="w-64 shrink-0">
                                            <input
                                                type="number"
                                                min={-100}
                                                max={-30}
                                                step={1}
                                                value={newRoomRssiThreshold}
                                                onChange={(event) => setNewRoomRssiThreshold(event.target.value)}
                                                className="glass-input w-full px-4 py-2.5 text-sm"
                                            />
                                            <p className="mt-1.5 whitespace-nowrap text-xs font-extrabold text-black">
                                                Recommended based on Capacity: {getRecommendedBeaconRssiThreshold(newRoomCapacity)} dBm
                                            </p>
                                        </div>
                                        <p className="min-w-0 flex-1 text-xs text-black/70">
                                            A lower value means that the user can be farther away from the beacon. Rough indoor estimates: -70 dBm ≈ 2–5 m, -75 dBm ≈ 4–8 m, -85 dBm ≈ 8–15 m. Actual distance varies with phones, walls, and beacon placement.
                                        </p>
                                    </div>
                                </div>
                            </div>}
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
                    <p className="text-sm text-black">Click &quot;Add Room&quot; above to add your first room.</p>
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
                            ref={editingRoomId === room.id ? editingRoomContainerRef : null}
                            className={`scroll-mt-24 rounded-2xl border border-white/70 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg sm:p-5 ${editingRoomId === room.id ? 'md:col-span-2 xl:col-span-3' : ''}`}
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
                                                className="glass-input w-full px-4 py-2.5 text-sm !border-gray-400 focus:!border-primary"
                                                placeholder="e.g. Room 312"
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-1.5 block text-xs font-bold text-black">Floor *</label>
                                            <select
                                                value={editFloor}
                                                onChange={(event) => setEditFloor(event.target.value)}
                                                className="glass-input w-full cursor-pointer appearance-none px-4 py-2.5 text-sm !border-gray-400 focus:!border-primary"
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
                                                className="glass-input w-full cursor-pointer appearance-none px-4 py-2.5 text-sm !border-gray-400 focus:!border-primary"
                                            >
                                                <option value="" disabled>Select room type</option>
                                                {ROOM_TYPE_OPTIONS.map((option) => (
                                                    <option key={option} value={option}>
                                                        {ROOM_TYPE_LABELS[option]}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        {showRoomIdentifiers && <div className="sm:col-span-2">
                                            <div className="flex w-full gap-4">
                                                <div className="flex-1 min-w-0">
                                                    <label className="mb-1.5 block text-xs font-bold text-black">Beacon ID (bld-roomname-beacon)</label>
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="text"
                                                            value={editBeaconId}
                                                            onChange={(event) => setEditBeaconId(event.target.value)}
                                                            className="glass-input w-full px-4 py-2.5 text-sm !border-gray-400 focus:!border-primary"
                                                            placeholder="e.g. dc-312-beacon or gd3-506-beacon"
                                                        />
                                                        <button
                                                            onClick={() => void copyToClipboard(editBeaconId, 'Beacon ID')}
                                                            className="p-1 rounded hover:bg-primary/10 transition-all"
                                                            title="Copy Beacon ID"
                                                            disabled={!editBeaconId}
                                                        >
                                                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" stroke="currentColor" strokeWidth="2"/>
                                                                <path d="M5 15H4a2 2 0 01-2-2V6a2 2 0 012-2h3a2 2 0 012 2v1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                            </svg>
                                                        </button>
                                                    </div>
                                                    <p className="mt-1.5 text-xs text-black">
                                                        This will be used by the ESP32 BLE device for Bluetooth room check-in. Not required for all rooms.
                                                    </p>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <label className="mb-1.5 block text-xs font-bold text-black">Room ID</label>
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="text"
                                                            value={editingRoomId || ''}
                                                            readOnly
                                                            className="glass-input w-full px-4 py-2.5 text-sm !border-gray-400 focus:!border-primary"
                                                        />
                                                        <button
                                                            onClick={() => void copyToClipboard(editingRoomId || '', 'Room ID')}
                                                            className="p-1 rounded hover:bg-primary/10 transition-all"
                                                            title="Copy Room ID"
                                                            disabled={!editingRoomId}
                                                        >
                                                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" stroke="currentColor" strokeWidth="2"/>
                                                                <path d="M5 15H4a2 2 0 01-2-2V6a2 2 0 012-2h3a2 2 0 012 2v1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                            </svg>
                                                        </button>
                                                    </div>
                                                    <p className="mt-1.5 text-xs text-black">
                                                        Unique identifier for this room. This is retrieved from the system's database.
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="mt-4 w-full">
                                                <label className="mb-1.5 block text-xs font-bold text-black">Beacon RSSI threshold (dBm)</label>
                                                <div className="flex w-full items-start gap-4">
                                                    <div className="w-64 shrink-0">
                                                        <input
                                                            type="number"
                                                            min={-100}
                                                            max={-30}
                                                            step={1}
                                                            value={editRssiThreshold}
                                                            onChange={(event) => setEditRssiThreshold(event.target.value)}
                                                            className="glass-input w-full px-4 py-2.5 text-sm !border-gray-400 focus:!border-primary"
                                                        />
                                                        <p className="mt-1.5 whitespace-nowrap text-xs font-extrabold text-black">
                                                            Recommended based on Capacity: {getRecommendedBeaconRssiThreshold(editCapacity)} dBm
                                                        </p>
                                                    </div>
                                                    <p className="min-w-0 flex-1 text-xs text-black/70">
                                                        A lower value means that the user can be farther away from the beacon. Rough indoor estimates: -70 dBm ≈ 2–5 m, -75 dBm ≈ 4–8 m, -85 dBm ≈ 8–15 m. Actual distance varies with phones, walls, and beacon placement.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>}
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
                                                className="glass-input w-full px-4 py-2.5 text-sm sm:w-40 !border-gray-400 focus:!border-primary"
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
                                            <StatusBadge status={getRoomBadgeStatus(room)} />
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-3">
                                        {showRoomIdentifiers && <button
                                            type="button"
                                            onClick={() => startCopyRoomScript(room)}
                                            disabled={deletingRoomId === room.id}
                                            className="ui-button-blue rounded-lg px-3 py-2 text-[11px] font-bold disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            Copy Script
                                        </button>}
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
            {showRoomIdentifiers && beaconPromptRoom ? (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4" role="presentation">
                    <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="beacon-prompt-title">
                        <h2 id="beacon-prompt-title" className="text-lg font-bold text-black">Add Beacon ID</h2>
                        <p className="mt-2 text-sm text-black/70">This room needs a Beacon ID before its hardware script can be configured.</p>
                        <label className="mt-5 block text-xs font-bold text-black" htmlFor="room-beacon-prompt">Beacon ID</label>
                        <input
                            id="room-beacon-prompt"
                            autoFocus
                            value={beaconPromptValue}
                            onChange={(event) => setBeaconPromptValue(event.target.value)}
                            placeholder="bld-roomname-beacon"
                            className="glass-input mt-1.5 w-full px-4 py-2.5 text-sm"
                        />
                        {beaconPromptError ? <p className="mt-2 text-sm text-red-700">{beaconPromptError}</p> : null}
                        <div className="mt-5 flex flex-nowrap items-center justify-end gap-2">
                            <button type="button" onClick={() => void saveBeaconId(false)} disabled={savingBeaconPrompt || !beaconPromptValue.trim()} className="rounded-lg px-3 py-2 text-sm font-bold ui-button-green disabled:opacity-60">
                                Add Beacon ID Only
                            </button>
                            <button type="button" onClick={() => void saveBeaconId(true)} disabled={savingBeaconPrompt || !beaconPromptValue.trim()} className="ui-button-blue rounded-lg px-3 py-2 text-sm font-bold disabled:opacity-60">
                                Add Beacon ID and Copy Script
                            </button>
                            <button type="button" onClick={() => setBeaconPromptRoom(null)} disabled={savingBeaconPrompt} className="rounded-lg border border-dark/10 px-3 py-2 text-sm font-bold text-black hover:bg-dark/5 disabled:opacity-60">
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
