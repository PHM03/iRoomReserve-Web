const DEFAULT_DEVICE_TIME = 'Waiting for device time';
const DEFAULT_ALERT_MESSAGE = 'No active alerts';

function createParsedESP32Payload(rawString = '') {
  return {
    raw: rawString,
    occupancyCount: null,
    connectionType: null,
    status: null,
    time: null,
    alert: null,
    alertCode: null,
  };
}

function formatAlertMessage(value) {
  return value
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeStatusValue(value) {
  return value.trim().toLowerCase();
}

export function createInitialESP32State() {
  return {
    occupancyCount: 0,
    status: 'disconnected',
    connectionType: 'disconnected',
    time: DEFAULT_DEVICE_TIME,
    alert: DEFAULT_ALERT_MESSAGE,
    alertCode: null,
    raw: '',
  };
}

export function parseESP32Data(rawString) {
  const parsedData = createParsedESP32Payload(rawString);

  if (typeof rawString !== 'string' || rawString.trim().length === 0) {
    return parsedData;
  }

  rawString
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const separatorIndex = line.indexOf(':');

      if (separatorIndex === -1) {
        return;
      }

      const key = line.slice(0, separatorIndex).trim().toUpperCase();
      const value = line.slice(separatorIndex + 1).trim();

      switch (key) {
        case 'CONNECTED':
          parsedData.connectionType = 'connected';
          parsedData.status = 'connected';
          parsedData.time = value || parsedData.time;
          break;
        case 'DISCONNECTED':
          parsedData.connectionType = 'disconnected';
          parsedData.status = 'disconnected';
          parsedData.time = value || parsedData.time;
          break;
        case 'OCCUPIED': {
          const nextCount = Number.parseInt(value, 10);

          if (!Number.isNaN(nextCount)) {
            parsedData.occupancyCount = nextCount;
          }

          break;
        }
        case 'STATUS': {
          const normalizedStatus = normalizeStatusValue(value);
          parsedData.status = normalizedStatus;

          if (
            normalizedStatus === 'connected' ||
            normalizedStatus === 'disconnected'
          ) {
            parsedData.connectionType = normalizedStatus;
          }

          break;
        }
        case 'TIME':
          parsedData.time = value || null;
          break;
        case 'ALERT':
          parsedData.alertCode = value || null;
          parsedData.alert = value ? formatAlertMessage(value) : null;
          break;
        default:
          break;
      }
    });

  return parsedData;
}

export function applyESP32Update(currentState, parsedData) {
  return {
    ...currentState,
    occupancyCount: parsedData.occupancyCount ?? currentState.occupancyCount,
    status: parsedData.status ?? currentState.status,
    connectionType: parsedData.connectionType ?? currentState.connectionType,
    time: parsedData.time ?? currentState.time,
    alert: parsedData.alert ?? currentState.alert,
    alertCode: parsedData.alertCode ?? currentState.alertCode,
    raw: parsedData.raw || currentState.raw,
  };
}

export function formatStatusLabel(value) {
  if (!value) {
    return 'Unknown';
  }

  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
