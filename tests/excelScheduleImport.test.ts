import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';

import type { Room } from '../lib/rooms/rooms';
import { parseScheduleWorkbook } from '../lib/schedules/excelScheduleImport';

const rooms = [
  {
    id: 'room-312',
    name: '312',
    buildingId: 'gd1',
    buildingName: 'GD1',
    floor: '3',
  },
] as Room[];

function createWorkbook(
  rows: unknown[][],
  merges: XLSX.Range[] = [],
  sheetName = 'Room 312'
) {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet['!merges'] = merges;
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  return workbook;
}

describe('Excel schedule import parser', () => {
  it('parses a merged multi-hour class block into one schedule row', () => {
    const workbook = createWorkbook(
      [
        ['Room 312'],
        [],
        ['Time', 'Monday', 'Tuesday'],
        ['8:00 AM - 9:00 AM', 'Introduction to Computing\nBSIT1A', ''],
        ['9:00 AM - 10:00 AM', '', ''],
      ],
      [{ s: { r: 3, c: 1 }, e: { r: 4, c: 1 } }]
    );

    const result = parseScheduleWorkbook(workbook, rooms);

    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      roomId: 'room-312',
      roomName: '312',
      dayOfWeek: 1,
      dayName: 'Monday',
      startTime: '08:00',
      endTime: '10:00',
      subject: 'Introduction to Computing',
      section: 'BSIT1A',
    });
  });

  it('normalizes abbreviated days and afternoon times without meridiem text', () => {
    const workbook = createWorkbook([
      ['Room 312'],
      ['Time', 'Mon', 'Tue'],
      ['1:00 - 3:00', 'Data Structures\nBSIT2B', ''],
    ]);

    const result = parseScheduleWorkbook(workbook, rooms);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      dayOfWeek: 1,
      startTime: '13:00',
      endTime: '15:00',
      subject: 'Data Structures',
      section: 'BSIT2B',
    });
  });

  it('keeps rows but flags an unknown room from the sheet header', () => {
    const workbook = createWorkbook(
      [
        ['Room 999'],
        ['Time', 'Monday', 'Tuesday'],
        ['8:00 AM - 9:00 AM', 'Networking\nBSIT3A', ''],
      ],
      [],
      'Room 999'
    );

    const result = parseScheduleWorkbook(workbook, rooms);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].errors).toContain(
      'Room "999" was not found in this building.'
    );
  });
});
