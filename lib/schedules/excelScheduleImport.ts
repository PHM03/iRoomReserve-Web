import * as XLSX from "xlsx";

import type { Room } from "../rooms/rooms";

interface DayColumn {
  col: number;
  dayOfWeek: number;
  label: string;
}

interface TimeSlot {
  row: number;
  startMinutes: number;
  endMinutes: number;
}

interface ParsedBlockContent {
  courseCode: string;
  instructorName: string;
  professorEmail: string;
  section: string;
  subject: string;
}

interface ListColumnMap {
  courseCode: number | null;
  day: number;
  instructorName: number | null;
  professorEmail: number | null;
  room: number;
  section: number | null;
  subject: number;
  time: number;
}

export interface ExcelScheduleImportCandidate {
  id: string;
  sourceSheet: string;
  sourceCell: string;
  detectedRoomName: string;
  roomId: string;
  roomName: string;
  buildingId: string;
  dayOfWeek: number;
  dayName: string;
  startTime: string;
  endTime: string;
  subject: string;
  section: string;
  courseCode: string;
  instructorName: string;
  professorEmail: string;
  errors: string[];
}

export interface ExcelScheduleImportResult {
  rows: ExcelScheduleImportCandidate[];
  errors: string[];
}

const DAY_ALIASES: Record<string, number> = {
  sun: 0,
  sunday: 0,
  m: 1,
  mon: 1,
  monday: 1,
  t: 2,
  tue: 2,
  tues: 2,
  tuesday: 2,
  w: 3,
  wed: 3,
  weds: 3,
  wednesday: 3,
  h: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  f: 5,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

const DAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const IGNORED_BLOCK_LABELS = new Set([
  "break",
  "lunch",
  "no class",
  "none",
  "n/a",
  "na",
  "recess",
  "vacant",
]);

const SECTION_PATTERNS = [
  /\b(?:BS|AB|BEED|BSED|BSA|BSBA|BSIT|BSCS|BSCPE|BSHM|BSTM|STEM|HUMSS|ABM|GAS|ICT|TVL)[A-Z]*(?:[-\s]?\d{1,2}[A-Z]?)\b/i,
  /\b[A-Z]{2,}[A-Z0-9]*(?:[-\s]?\d{1,2}[A-Z])\b/,
];

const TIME_TOKEN_PATTERN =
  /\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?|am|pm)?\b/gi;
const PROFESSOR_EMAIL_PATTERN = /^[^\s@]+@sdca\.edu\.ph$/i;

function cleanCellText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date) {
    return minutesToTime(value.getHours() * 60 + value.getMinutes());
  }

  return String(value)
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function splitCellLines(value: string): string[] {
  return cleanCellText(value)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeRoomToken(value: string): string {
  return normalizeSearchText(value)
    .replace(/\b(room|rm|no|number)\b/g, " ")
    .replace(/\s+/g, "");
}

function getCellText(sheet: XLSX.WorkSheet, row: number, col: number): string {
  const address = XLSX.utils.encode_cell({ r: row, c: col });
  const cell = sheet[address] as XLSX.CellObject | undefined;

  if (!cell) {
    return "";
  }

  if (typeof cell.w === "string" && cell.w.trim()) {
    return cleanCellText(cell.w);
  }

  if (typeof cell.v === "number" && cell.v >= 0 && cell.v < 1) {
    return minutesToTime(Math.round(cell.v * 24 * 60));
  }

  return cleanCellText(cell.v);
}

function getMergeForCell(
  merges: XLSX.Range[],
  row: number,
  col: number
): XLSX.Range | null {
  return (
    merges.find(
      (merge) =>
        row >= merge.s.r &&
        row <= merge.e.r &&
        col >= merge.s.c &&
        col <= merge.e.c
    ) ?? null
  );
}

function getEffectiveCellText(
  sheet: XLSX.WorkSheet,
  merges: XLSX.Range[],
  row: number,
  col: number
): string {
  const directText = getCellText(sheet, row, col);
  if (directText) {
    return directText;
  }

  const merge = getMergeForCell(merges, row, col);
  return merge ? getCellText(sheet, merge.s.r, merge.s.c) : "";
}

function detectDay(value: string): number | null {
  const tokens = normalizeSearchText(value).split(/\s+/).filter(Boolean);

  for (const token of tokens) {
    if (token in DAY_ALIASES) {
      return DAY_ALIASES[token];
    }
  }

  return null;
}

function detectListColumn(value: string): keyof ListColumnMap | null {
  const normalized = normalizeSearchText(value);

  if (/^(room|room name|classroom)$/.test(normalized)) return "room";
  if (/^(course code|subject code|code)$/.test(normalized)) return "courseCode";
  if (/^(professor|prof|instructor|teacher|faculty)$/.test(normalized)) {
    return "instructorName";
  }
  if (/^(professor email|prof email|instructor email|faculty email|teacher email|email)$/.test(normalized)) {
    return "professorEmail";
  }
  if (/^(course name|subject|subject name|course|class name)$/.test(normalized)) {
    return "subject";
  }
  if (/^(time|class time|schedule time|time slot)$/.test(normalized)) {
    return "time";
  }
  if (/^(day|day of week|weekday)$/.test(normalized)) return "day";
  if (/^(section|program and section|program section|program)$/.test(normalized)) {
    return "section";
  }

  return null;
}

function findListColumns(
  sheet: XLSX.WorkSheet,
  merges: XLSX.Range[],
  range: XLSX.Range
): { columns: ListColumnMap; row: number } | null {
  for (let row = range.s.r; row <= range.e.r; row += 1) {
    const columns: Partial<ListColumnMap> = {};

    for (let col = range.s.c; col <= range.e.c; col += 1) {
      const column = detectListColumn(getEffectiveCellText(sheet, merges, row, col));
      if (column && columns[column] === undefined) {
        columns[column] = col;
      }
    }

    if (
      columns.room !== undefined &&
      columns.subject !== undefined &&
      columns.time !== undefined &&
      columns.day !== undefined
    ) {
      return {
        columns: {
          courseCode: columns.courseCode ?? null,
          day: columns.day,
          instructorName: columns.instructorName ?? null,
          professorEmail: columns.professorEmail ?? null,
          room: columns.room,
          section: columns.section ?? null,
          subject: columns.subject,
          time: columns.time,
        },
        row,
      };
    }
  }

  return null;
}

function findHeaderRow(
  sheet: XLSX.WorkSheet,
  merges: XLSX.Range[],
  range: XLSX.Range
): { dayColumns: DayColumn[]; row: number } | null {
  for (let row = range.s.r; row <= range.e.r; row += 1) {
    const dayColumns: DayColumn[] = [];
    const seenDays = new Set<number>();

    for (let col = range.s.c; col <= range.e.c; col += 1) {
      const dayOfWeek = detectDay(getEffectiveCellText(sheet, merges, row, col));
      if (dayOfWeek === null || seenDays.has(dayOfWeek)) {
        continue;
      }

      seenDays.add(dayOfWeek);
      dayColumns.push({
        col,
        dayOfWeek,
        label: DAY_LABELS[dayOfWeek],
      });
    }

    if (dayColumns.length >= 2) {
      return { dayColumns, row };
    }
  }

  return null;
}

function normalizePeriod(value?: string): "am" | "pm" | null {
  if (!value) {
    return null;
  }

  return value.toLowerCase().startsWith("p") ? "pm" : "am";
}

function tokenToMinutes(token: {
  hour: number;
  minute: number;
  period: "am" | "pm" | null;
}) {
  let hour = token.hour;

  if (token.period === "am") {
    hour = hour === 12 ? 0 : hour;
  } else if (token.period === "pm") {
    hour = hour === 12 ? 12 : hour + 12;
  }

  return hour * 60 + token.minute;
}

function normalizeAmbiguousSchoolTime(
  minutes: number,
  hadPeriod: boolean
): number {
  if (hadPeriod) {
    return minutes;
  }

  return minutes < 7 * 60 ? minutes + 12 * 60 : minutes;
}

function parseTimeRange(value: string): {
  endMinutes: number | null;
  startMinutes: number;
} | null {
  const normalizedValue = value.replace(/[\u2013\u2014]/g, "-");
  const matches = [...normalizedValue.matchAll(TIME_TOKEN_PATTERN)]
    .map((match) => ({
      hour: Number(match[1]),
      minute: match[2] ? Number(match[2]) : 0,
      period: normalizePeriod(match[3]),
    }))
    .filter(
      (match) =>
        match.hour >= 0 &&
        match.hour <= 24 &&
        match.minute >= 0 &&
        match.minute <= 59
    );

  if (matches.length === 0) {
    return null;
  }

  const start = matches[0];
  const end = matches[1];

  if (!end) {
    const startMinutes = normalizeAmbiguousSchoolTime(
      tokenToMinutes(start),
      Boolean(start.period)
    );
    return { endMinutes: null, startMinutes };
  }

  const startPeriod =
    start.period ??
    (end.period === "pm" && start.hour > end.hour && start.hour !== 12
      ? "am"
      : end.period);
  const endPeriod = end.period ?? start.period;
  const startHadPeriod = Boolean(start.period || startPeriod);
  const endHadPeriod = Boolean(end.period || endPeriod);
  const startMinutes = normalizeAmbiguousSchoolTime(
    tokenToMinutes({ ...start, period: startPeriod }),
    startHadPeriod
  );
  let endMinutes = normalizeAmbiguousSchoolTime(
    tokenToMinutes({ ...end, period: endPeriod }),
    endHadPeriod
  );

  if (endMinutes <= startMinutes && endMinutes + 12 * 60 > startMinutes) {
    endMinutes += 12 * 60;
  }

  return { endMinutes, startMinutes };
}

function minutesToTime(minutes: number): string {
  const normalizedMinutes = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours = Math.floor(normalizedMinutes / 60);
  const mins = normalizedMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

function buildTimeSlots(
  sheet: XLSX.WorkSheet,
  merges: XLSX.Range[],
  range: XLSX.Range,
  headerRow: number,
  timeColumn: number
): TimeSlot[] {
  const parsedRows: Array<{
    endMinutes: number | null;
    row: number;
    startMinutes: number;
  }> = [];

  for (let row = headerRow + 1; row <= range.e.r; row += 1) {
    const parsed = parseTimeRange(
      getEffectiveCellText(sheet, merges, row, timeColumn)
    );

    if (parsed) {
      parsedRows.push({ row, ...parsed });
    }
  }

  return parsedRows
    .map((slot, index) => {
      const nextSlot = parsedRows[index + 1];
      const inferredEnd =
        slot.endMinutes ??
        (nextSlot && nextSlot.startMinutes > slot.startMinutes
          ? nextSlot.startMinutes
          : slot.startMinutes + 60);

      return {
        endMinutes: inferredEnd,
        row: slot.row,
        startMinutes: slot.startMinutes,
      };
    })
    .filter((slot) => slot.endMinutes > slot.startMinutes);
}

function findTimeColumn(
  sheet: XLSX.WorkSheet,
  merges: XLSX.Range[],
  range: XLSX.Range,
  headerRow: number,
  dayColumns: DayColumn[]
): number {
  const dayColumnSet = new Set(dayColumns.map((dayColumn) => dayColumn.col));
  let bestColumn = range.s.c;
  let bestScore = -1;

  for (let col = range.s.c; col <= range.e.c; col += 1) {
    if (dayColumnSet.has(col)) {
      continue;
    }

    let score = 0;
    for (let row = headerRow + 1; row <= range.e.r; row += 1) {
      if (parseTimeRange(getEffectiveCellText(sheet, merges, row, col))) {
        score += 1;
      }
    }

    if (score > bestScore) {
      bestColumn = col;
      bestScore = score;
    }
  }

  return bestColumn;
}

function getSlotForRow(timeSlots: TimeSlot[], row: number): TimeSlot | null {
  return (
    timeSlots.find((slot) => slot.row === row) ??
    [...timeSlots].reverse().find((slot) => slot.row <= row) ??
    null
  );
}

function extractRoomNameFromText(value: string): string {
  for (const line of splitCellLines(value)) {
    const roomMatch = line.match(
      /\b(?:room|rm)\s*(?:no\.?|number|#|:)?\s*([A-Za-z0-9][A-Za-z0-9 ._-]*)/i
    );

    if (roomMatch?.[1]) {
      return roomMatch[1].trim();
    }
  }

  return "";
}

function findRoomByName(rooms: Room[], value: string): Room | null {
  const normalizedValue = normalizeRoomToken(value);

  if (!normalizedValue) {
    return null;
  }

  const exactMatch = rooms.find((room) =>
    [room.name, room.id].some(
      (candidate) => normalizeRoomToken(candidate) === normalizedValue
    )
  );

  if (exactMatch) {
    return exactMatch;
  }

  return (
    rooms.find((room) =>
      [room.name, room.id].some((candidate) => {
        const normalizedCandidate = normalizeRoomToken(candidate);
        return (
          normalizedCandidate.length >= 3 &&
          normalizedValue.length >= 3 &&
          (normalizedValue.includes(normalizedCandidate) ||
            normalizedCandidate.includes(normalizedValue))
        );
      })
    ) ?? null
  );
}

function detectSheetRoom(
  sheet: XLSX.WorkSheet,
  merges: XLSX.Range[],
  range: XLSX.Range,
  headerRow: number,
  sheetName: string,
  rooms: Room[]
): { detectedRoomName: string; room: Room | null } {
  const searchTexts = [sheetName];
  const lastHeaderRow = Math.min(headerRow, range.s.r + 10);

  for (let row = range.s.r; row <= lastHeaderRow; row += 1) {
    for (let col = range.s.c; col <= range.e.c; col += 1) {
      const text = getEffectiveCellText(sheet, merges, row, col);
      if (text) {
        searchTexts.push(text);
      }
    }
  }

  for (const text of searchTexts) {
    const extractedRoomName = extractRoomNameFromText(text);
    if (!extractedRoomName) {
      continue;
    }

    return {
      detectedRoomName: extractedRoomName,
      room: findRoomByName(rooms, extractedRoomName),
    };
  }

  for (const text of searchTexts) {
    const matchingRoom = findRoomByName(rooms, text);
    if (matchingRoom) {
      return {
        detectedRoomName: matchingRoom.name,
        room: matchingRoom,
      };
    }
  }

  return {
    detectedRoomName: "",
    room: null,
  };
}

function isIgnoredBlockText(value: string): boolean {
  const normalized = normalizeSearchText(value);
  return !normalized || IGNORED_BLOCK_LABELS.has(normalized);
}

function findSection(value: string): string {
  for (const pattern of SECTION_PATTERNS) {
    const match = value.match(pattern);
    if (match?.[0]) {
      return match[0].replace(/\s+/g, "").trim();
    }
  }

  return "";
}

function looksLikeCourseCode(value: string): boolean {
  return /^[A-Z]{2,}\s*[A-Z]?\d{2,}[A-Z]?$/i.test(value.trim());
}

function parseBlockContent(text: string): ParsedBlockContent {
  const allMeaningfulLines = splitCellLines(text).filter(
    (line) =>
      !parseTimeRange(line) &&
      !extractRoomNameFromText(line) &&
      !isIgnoredBlockText(line)
  );
  const professorEmail =
    allMeaningfulLines.find((line) => PROFESSOR_EMAIL_PATTERN.test(line.trim())) ?? "";
  const meaningfulLines = allMeaningfulLines.filter(
    (line) => !PROFESSOR_EMAIL_PATTERN.test(line.trim())
  );
  const sectionIndex = meaningfulLines.findIndex((line) => Boolean(findSection(line)));
  let courseCode = "";
  let subject = "";
  let section = "";
  let instructorName = "";

  if (sectionIndex >= 0) {
    section = findSection(meaningfulLines[sectionIndex]);
    const subjectLines = meaningfulLines.slice(0, sectionIndex);
    const trailingLines = meaningfulLines.slice(sectionIndex + 1);

    if (subjectLines.length >= 2 && looksLikeCourseCode(subjectLines[0])) {
      courseCode = subjectLines[0];
      subject = subjectLines.slice(1).join(" ");
    } else {
      subject = subjectLines.join(" ");
    }

    instructorName = trailingLines[0] ?? "";
  } else if (meaningfulLines.length >= 2) {
    subject = meaningfulLines[0];
    section = meaningfulLines[1];
    instructorName = meaningfulLines[2] ?? "";
  } else if (meaningfulLines.length === 1) {
    const line = meaningfulLines[0];
    const inlineSection = findSection(line);
    if (inlineSection) {
      section = inlineSection;
      subject = line.replace(inlineSection, "").trim();
    } else {
      subject = line;
    }
  }

  const normalizedSubject = subject.trim();
  const normalizedSection = section.trim();

  return {
    courseCode: (courseCode || normalizedSubject).trim(),
    instructorName: instructorName.trim() || "Imported Schedule",
    professorEmail: professorEmail.trim().toLowerCase(),
    section: normalizedSection,
    subject: normalizedSubject,
  };
}

function parseListSheet(
  workbookSheet: XLSX.WorkSheet,
  sheetName: string,
  rooms: Room[],
  range: XLSX.Range,
  merges: XLSX.Range[],
  header: { columns: ListColumnMap; row: number }
): ExcelScheduleImportResult {
  const rows: ExcelScheduleImportCandidate[] = [];

  for (let row = header.row + 1; row <= range.e.r; row += 1) {
    const roomText = getEffectiveCellText(
      workbookSheet,
      merges,
      row,
      header.columns.room
    );
    const subject = getEffectiveCellText(
      workbookSheet,
      merges,
      row,
      header.columns.subject
    );
    const timeText = getEffectiveCellText(
      workbookSheet,
      merges,
      row,
      header.columns.time
    );
    const dayText = getEffectiveCellText(
      workbookSheet,
      merges,
      row,
      header.columns.day
    );

    if (!roomText && !subject && !timeText && !dayText) {
      continue;
    }

    const room = findRoomByName(rooms, roomText);
    const dayOfWeek = detectDay(dayText);
    const parsedTime = parseTimeRange(timeText);
    const section =
      header.columns.section === null
        ? ""
        : getEffectiveCellText(
            workbookSheet,
            merges,
            row,
            header.columns.section
          );
    const courseCode =
      header.columns.courseCode === null
        ? subject
        : getEffectiveCellText(
            workbookSheet,
            merges,
            row,
            header.columns.courseCode
          ) || subject;
    const instructorName =
      header.columns.instructorName === null
        ? "Imported Schedule"
        : getEffectiveCellText(
            workbookSheet,
            merges,
            row,
            header.columns.instructorName
          ) || "Imported Schedule";
    const professorEmail =
      header.columns.professorEmail === null
        ? ""
        : getEffectiveCellText(
            workbookSheet,
            merges,
            row,
            header.columns.professorEmail
          );
    const errors: string[] = [];

    if (!roomText) {
      errors.push("Room is required.");
    } else if (!room) {
      errors.push(`Room "${roomText}" was not found in this building.`);
    }

    if (dayOfWeek === null) {
      errors.push(`Day "${dayText}" was not recognized.`);
    }

    if (!parsedTime || parsedTime.endMinutes === null) {
      errors.push(`Time "${timeText}" was not recognized.`);
    }

    if (!subject) {
      errors.push("Subject is required.");
    }

    if (!section) {
      errors.push("Section is required.");
    }

    if (!professorEmail) {
      errors.push("Professor email is required.");
    }

    rows.push({
      buildingId: room?.buildingId ?? "",
      courseCode,
      dayName: dayOfWeek === null ? dayText : DAY_LABELS[dayOfWeek],
      dayOfWeek: dayOfWeek ?? 0,
      detectedRoomName: roomText,
      endTime: parsedTime && parsedTime.endMinutes !== null
        ? minutesToTime(parsedTime.endMinutes)
        : "",
      errors,
      id: `${sheetName}-${row}-${rows.length}`,
      instructorName,
      professorEmail,
      roomId: room?.id ?? "",
      roomName: room?.name ?? roomText,
      section,
      sourceCell: XLSX.utils.encode_cell({ c: header.columns.room, r: row }),
      sourceSheet: sheetName,
      startTime: parsedTime ? minutesToTime(parsedTime.startMinutes) : "",
      subject,
    });
  }

  return { errors: [], rows };
}

function parseSheet(
  workbookSheet: XLSX.WorkSheet,
  sheetName: string,
  rooms: Room[]
): ExcelScheduleImportResult {
  const ref = workbookSheet["!ref"];
  if (!ref) {
    return { errors: [`${sheetName}: sheet is empty.`], rows: [] };
  }

  const range = XLSX.utils.decode_range(ref);
  const merges = (workbookSheet["!merges"] ?? []) as XLSX.Range[];
  const listHeader = findListColumns(workbookSheet, merges, range);

  if (listHeader) {
    return parseListSheet(
      workbookSheet,
      sheetName,
      rooms,
      range,
      merges,
      listHeader
    );
  }

  const header = findHeaderRow(workbookSheet, merges, range);

  if (!header) {
    return {
      errors: [`${sheetName}: day headers were not detected.`],
      rows: [],
    };
  }

  const timeColumn = findTimeColumn(
    workbookSheet,
    merges,
    range,
    header.row,
    header.dayColumns
  );
  const timeSlots = buildTimeSlots(
    workbookSheet,
    merges,
    range,
    header.row,
    timeColumn
  );

  if (timeSlots.length === 0) {
    return {
      errors: [`${sheetName}: time rows were not detected.`],
      rows: [],
    };
  }

  const { detectedRoomName, room } = detectSheetRoom(
    workbookSheet,
    merges,
    range,
    header.row,
    sheetName,
    rooms
  );
  const rows: ExcelScheduleImportCandidate[] = [];
  const seenBlocks = new Set<string>();

  for (const dayColumn of header.dayColumns) {
    for (let row = header.row + 1; row <= range.e.r; row += 1) {
      const text = getEffectiveCellText(
        workbookSheet,
        merges,
        row,
        dayColumn.col
      );

      if (!text || isIgnoredBlockText(text)) {
        continue;
      }

      const merge =
        getMergeForCell(merges, row, dayColumn.col) ?? {
          e: { c: dayColumn.col, r: row },
          s: { c: dayColumn.col, r: row },
        };
      const blockKey = [
        sheetName,
        dayColumn.dayOfWeek,
        merge.s.r,
        merge.s.c,
        merge.e.r,
        merge.e.c,
      ].join(":");

      if (seenBlocks.has(blockKey)) {
        continue;
      }
      seenBlocks.add(blockKey);

      const startSlot = getSlotForRow(timeSlots, merge.s.r);
      const endSlot = getSlotForRow(timeSlots, merge.e.r);
      const content = parseBlockContent(text);
      const errors: string[] = [];

      if (!detectedRoomName) {
        errors.push("Room name was not found in the sheet header.");
      } else if (!room) {
        errors.push(`Room "${detectedRoomName}" was not found in this building.`);
      }

      if (!startSlot || !endSlot) {
        errors.push("Start or end time could not be detected.");
      }

      if (!content.subject) {
        errors.push("Subject could not be detected.");
      }

      if (!content.section) {
        errors.push("Section could not be detected.");
      }

      const sourceCell = XLSX.utils.encode_cell({
        c: dayColumn.col,
        r: merge.s.r,
      });

      rows.push({
        buildingId: room?.buildingId ?? "",
        courseCode: content.courseCode,
        dayName: dayColumn.label,
        dayOfWeek: dayColumn.dayOfWeek,
        detectedRoomName,
        endTime: endSlot ? minutesToTime(endSlot.endMinutes) : "",
        errors,
        id: `${sheetName}-${sourceCell}-${rows.length}`,
        instructorName: content.instructorName,
        professorEmail: content.professorEmail,
        roomId: room?.id ?? "",
        roomName: room?.name ?? detectedRoomName,
        section: content.section,
        sourceCell,
        sourceSheet: sheetName,
        startTime: startSlot ? minutesToTime(startSlot.startMinutes) : "",
        subject: content.subject,
      });
    }
  }

  return { errors: [], rows };
}

export function parseScheduleWorkbook(
  workbook: XLSX.WorkBook,
  rooms: Room[]
): ExcelScheduleImportResult {
  const result: ExcelScheduleImportResult = { errors: [], rows: [] };

  workbook.SheetNames.forEach((sheetName) => {
    const sheetResult = parseSheet(workbook.Sheets[sheetName], sheetName, rooms);
    result.rows.push(...sheetResult.rows);
    result.errors.push(...sheetResult.errors);
  });

  if (result.rows.length === 0 && result.errors.length === 0) {
    result.errors.push("No class schedule blocks were detected.");
  }

  return result;
}

export async function parseScheduleExcelFile(
  file: File,
  rooms: Room[]
): Promise<ExcelScheduleImportResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, {
    cellDates: true,
    cellText: true,
    type: "array",
  });

  return parseScheduleWorkbook(workbook, rooms);
}
