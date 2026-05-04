type DateLike =
  | Date
  | string
  | null
  | undefined
  | {
      toDate?: () => Date;
    };

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_TIME_PATTERN = /^(\d{2}):(\d{2})(?::\d{2})?$/;
const DATETIME_TIME_PATTERN = /(?:T|\s)(\d{2}):(\d{2})(?::\d{2})?/;

function isValidDate(value: Date) {
  return !Number.isNaN(value.getTime());
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function getDateParts(value: Date) {
  return {
    day: pad(value.getDate()),
    month: pad(value.getMonth() + 1),
    year: value.getFullYear(),
  };
}

function parseDateLike(value: DateLike): Date | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return isValidDate(value) ? value : null;
  }

  if (typeof value === 'string') {
    const parsed = new Date(value);
    return isValidDate(parsed) ? parsed : null;
  }

  if (typeof value.toDate === 'function') {
    const parsed = value.toDate();
    return parsed instanceof Date && isValidDate(parsed) ? parsed : null;
  }

  return null;
}

export function extractTimeString(value?: string | null): string {
  if (!value) {
    return '';
  }

  const trimmedValue = value.trim();
  const directMatch = trimmedValue.match(ISO_TIME_PATTERN);
  if (directMatch) {
    return `${directMatch[1]}:${directMatch[2]}`;
  }

  const embeddedMatch = trimmedValue.match(DATETIME_TIME_PATTERN);
  if (embeddedMatch) {
    return `${embeddedMatch[1]}:${embeddedMatch[2]}`;
  }

  return trimmedValue;
}

export function formatDate(dateString: string): string {
  const trimmedValue = dateString.trim();
  const isoMatch = trimmedValue.match(ISO_DATE_PATTERN);

  if (isoMatch) {
    return `${isoMatch[2]}/${isoMatch[3]}/${isoMatch[1]}`;
  }

  const parsedDate = parseDateLike(trimmedValue);
  if (!parsedDate) {
    return trimmedValue;
  }

  const { day, month, year } = getDateParts(parsedDate);
  return `${month}/${day}/${year}`;
}

export function formatDateValue(value: DateLike): string {
  if (!value) {
    return '';
  }

  if (typeof value === 'string') {
    return formatDate(value);
  }

  const parsedDate = parseDateLike(value);
  if (!parsedDate) {
    return '';
  }

  const { day, month, year } = getDateParts(parsedDate);
  return `${month}/${day}/${year}`;
}

export function formatTime(timeString: string): string {
  const normalizedTime = extractTimeString(timeString);
  const timeMatch = normalizedTime.match(ISO_TIME_PATTERN);

  if (!timeMatch) {
    return normalizedTime;
  }

  let hour = Number.parseInt(timeMatch[1], 10);
  const minutes = timeMatch[2] || '00';
  const period = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;
  return `${hour}:${minutes} ${period}`;
}

export function formatTimeRange(start?: string | null, end?: string | null): string {
  if (!start && !end) {
    return '';
  }

  if (!start) {
    return formatTime(end ?? '');
  }

  if (!end) {
    return formatTime(start);
  }

  return `${formatTime(start)} - ${formatTime(end)}`;
}

export function formatClockTime(
  value: DateLike,
  options: { includeSeconds?: boolean } = {}
): string {
  const parsedDate = parseDateLike(value);
  if (!parsedDate) {
    return '';
  }

  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    hour12: true,
    minute: '2-digit',
    ...(options.includeSeconds ? { second: '2-digit' } : {}),
  }).format(parsedDate);
}

export function formatDateTime(
  value: DateLike,
  options: {
    includeSeconds?: boolean;
    separator?: string;
  } = {}
): string {
  const dateLabel = formatDateValue(value);
  const timeLabel = formatClockTime(value, {
    includeSeconds: options.includeSeconds,
  });

  if (!dateLabel) {
    return timeLabel;
  }

  if (!timeLabel) {
    return dateLabel;
  }

  return `${dateLabel}${options.separator ?? ' at '}${timeLabel}`;
}
