export { parseESP32Data } from './esp32Data';

// Replace these placeholder UUIDs with the ESP32 service and characteristic
// UUIDs exposed by your firmware.
const BLE_SERVICE_UUID = '00000000-0000-1000-8000-00805f9b34fb';
const BLE_CHARACTERISTIC_UUID = '00000001-0000-1000-8000-00805f9b34fb';

const bleSession = {
  device: null,
  server: null,
  service: null,
  characteristic: null,
  notificationListener: null,
  incomingBuffer: '',
};

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

function ensureWebBluetoothSupport() {
  if (typeof navigator === 'undefined' || !navigator.bluetooth) {
    throw new Error(
      'Web Bluetooth is only available in a supported browser such as Chrome.'
    );
  }
}

function resetActiveConnection() {
  bleSession.server = null;
  bleSession.service = null;
  bleSession.characteristic = null;
  bleSession.notificationListener = null;
  bleSession.incomingBuffer = '';
}

function handleDeviceDisconnected() {
  resetActiveConnection();
}

function attachInternalDisconnectListener(targetDevice) {
  targetDevice.addEventListener(
    'gattserverdisconnected',
    handleDeviceDisconnected
  );
}

function detachInternalDisconnectListener(targetDevice = bleSession.device) {
  targetDevice?.removeEventListener(
    'gattserverdisconnected',
    handleDeviceDisconnected
  );
}

function flushBufferedMessages(chunk, onDataCallback) {
  bleSession.incomingBuffer += chunk.replace(/\r/g, '');

  const segments = bleSession.incomingBuffer.split('\n');
  bleSession.incomingBuffer = segments.pop() ?? '';

  segments
    .map((segment) => segment.trim())
    .filter(Boolean)
    .forEach((message) => {
      onDataCallback(message);
    });

  const trailingMessage = bleSession.incomingBuffer.trim();

  // Some ESP32 firmwares send one complete payload per notification even
  // without a trailing newline.
  if (trailingMessage && /^[A-Z_]+:.+/i.test(trailingMessage)) {
    onDataCallback(trailingMessage);
    bleSession.incomingBuffer = '';
  }
}

async function stopActiveNotifications() {
  const { characteristic, notificationListener } = bleSession;

  if (!characteristic) {
    return;
  }

  if (notificationListener) {
    characteristic.removeEventListener(
      'characteristicvaluechanged',
      notificationListener
    );
  }

  try {
    await characteristic.stopNotifications();
  } catch {
    // Ignore stop failures during disconnect or device loss.
  }

  bleSession.notificationListener = null;
  bleSession.incomingBuffer = '';
}

async function ensureCharacteristic() {
  if (bleSession.characteristic) {
    return bleSession.characteristic;
  }

  if (!bleSession.server?.connected) {
    throw new Error('Bluetooth device is not connected.');
  }

  bleSession.service =
    bleSession.service ??
    (await bleSession.server.getPrimaryService(BLE_SERVICE_UUID));

  bleSession.characteristic =
    bleSession.characteristic ??
    (await bleSession.service.getCharacteristic(BLE_CHARACTERISTIC_UUID));

  return bleSession.characteristic;
}

async function openDeviceConnection(targetDevice) {
  attachInternalDisconnectListener(targetDevice);

  try {
    bleSession.server = await targetDevice.gatt.connect();
    bleSession.service = await bleSession.server.getPrimaryService(
      BLE_SERVICE_UUID
    );
    bleSession.characteristic = await bleSession.service.getCharacteristic(
      BLE_CHARACTERISTIC_UUID
    );
    bleSession.incomingBuffer = '';

    return targetDevice;
  } catch (error) {
    detachInternalDisconnectListener(targetDevice);
    throw error;
  }
}

async function requestESP32Device() {
  return navigator.bluetooth.requestDevice({
    filters: [{ namePrefix: 'ESP32' }],
    optionalServices: [BLE_SERVICE_UUID],
  });
}

export async function connectESP32() {
  ensureWebBluetoothSupport();

  if (bleSession.device?.gatt?.connected && bleSession.characteristic) {
    return bleSession.device;
  }

  if (bleSession.device) {
    detachInternalDisconnectListener();

    try {
      return await openDeviceConnection(bleSession.device);
    } catch {
      resetActiveConnection();
    }
  }

  bleSession.device = await requestESP32Device();
  return openDeviceConnection(bleSession.device);
}

export async function startReading(onDataCallback) {
  if (typeof onDataCallback !== 'function') {
    throw new Error('startReading requires a callback function.');
  }

  const characteristic = await ensureCharacteristic();

  if (bleSession.notificationListener) {
    characteristic.removeEventListener(
      'characteristicvaluechanged',
      bleSession.notificationListener
    );
  }

  bleSession.notificationListener = (event) => {
    const value = event.target?.value;

    if (!value) {
      return;
    }

    flushBufferedMessages(textDecoder.decode(value), onDataCallback);
  };

  characteristic.addEventListener(
    'characteristicvaluechanged',
    bleSession.notificationListener
  );
  await characteristic.startNotifications();

  return characteristic;
}

export async function sendCommand(command) {
  const characteristic = await ensureCharacteristic();
  const payload = textEncoder.encode(`${String(command).trim()}\n`);

  if (typeof characteristic.writeValueWithResponse === 'function') {
    await characteristic.writeValueWithResponse(payload);
    return;
  }

  if (typeof characteristic.writeValueWithoutResponse === 'function') {
    await characteristic.writeValueWithoutResponse(payload);
    return;
  }

  await characteristic.writeValue(payload);
}

export async function disconnect() {
  await stopActiveNotifications();

  if (bleSession.device?.gatt?.connected) {
    bleSession.device.gatt.disconnect();
  }

  detachInternalDisconnectListener();
  bleSession.device = null;
  resetActiveConnection();
}

export { BLE_SERVICE_UUID, BLE_CHARACTERISTIC_UUID };
