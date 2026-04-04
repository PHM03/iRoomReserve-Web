export interface BeaconConnection {
  characteristic: BluetoothRemoteGATTCharacteristic;
  device: BluetoothDevice;
  disconnect: () => Promise<void>;
  server: BluetoothRemoteGATTServer;
  service: BluetoothRemoteGATTService;
}

export interface ConnectToBeaconOptions {
  beaconId: string;
  onDisconnected?: (device: BluetoothDevice) => void;
  onNotification?: (
    value: DataView,
    characteristic: BluetoothRemoteGATTCharacteristic
  ) => void;
}

interface BluetoothErrorLike {
  message?: string;
  name?: string;
}

const BLE_SERVICE_UUID =
  process.env.NEXT_PUBLIC_ESP32_BLE_SERVICE_UUID?.trim() ?? "";
const BLE_CHARACTERISTIC_UUID =
  process.env.NEXT_PUBLIC_ESP32_BLE_CHARACTERISTIC_UUID?.trim() ?? "";

function getBluetoothErrorName(error: unknown) {
  if (error && typeof error === "object" && "name" in error) {
    return String((error as BluetoothErrorLike).name ?? "");
  }

  return "";
}

export function buildBeaconRequestOptions(
  beaconId: string,
  serviceUuid: string
): RequestDeviceOptions {
  return {
    filters: [
      {
        name: beaconId,
        services: [serviceUuid],
      },
    ],
    optionalServices: [serviceUuid],
  };
}

export function getBluetoothErrorMessage(error: unknown) {
  switch (getBluetoothErrorName(error)) {
    case "NotFoundError":
      return "Bluetooth device not found. Make sure the ESP32 beacon is powered on and nearby.";
    case "NotAllowedError":
      return "Bluetooth permission was denied. Turn Bluetooth on and allow access to continue.";
    case "NetworkError":
      return "Bluetooth connection failed. Make sure the room beacon is powered on and within range.";
    case "InvalidStateError":
      return "Bluetooth is currently unavailable. Turn it on and try again.";
    case "SecurityError":
      return "Web Bluetooth requires HTTPS or localhost to access the room beacon.";
    default:
      if (error instanceof Error && error.message) {
        const normalizedMessage = error.message.trim();
        if (normalizedMessage.length > 0) {
          return normalizedMessage;
        }
      }

      return "Bluetooth connection failed. Please try again.";
  }
}

async function ensureBluetoothIsReady() {
  if (typeof window === "undefined") {
    throw new Error("Bluetooth check-in is only available in the browser.");
  }

  if (!window.isSecureContext) {
    throw new Error(
      "Web Bluetooth requires HTTPS or localhost before room beacons can be used."
    );
  }

  if (typeof navigator === "undefined" || !navigator.bluetooth) {
    throw new Error(
      "Web Bluetooth is only available in supported browsers such as Chrome or Edge."
    );
  }

  if (!BLE_SERVICE_UUID || !BLE_CHARACTERISTIC_UUID) {
    throw new Error(
      "Configure NEXT_PUBLIC_ESP32_BLE_SERVICE_UUID and NEXT_PUBLIC_ESP32_BLE_CHARACTERISTIC_UUID before using Bluetooth check-in."
    );
  }

  if (typeof navigator.bluetooth.getAvailability === "function") {
    const available = await navigator.bluetooth.getAvailability().catch(() => true);
    if (!available) {
      throw new Error(
        "Bluetooth is turned off or unavailable on this device."
      );
    }
  }
}

export async function connectToBeacon({
  beaconId,
  onDisconnected,
  onNotification,
}: ConnectToBeaconOptions): Promise<BeaconConnection> {
  const expectedBeaconId = beaconId.trim();
  if (!expectedBeaconId) {
    throw new Error("This room does not have a beacon ID configured yet.");
  }

  await ensureBluetoothIsReady();
  const bluetooth = navigator.bluetooth;
  if (!bluetooth) {
    throw new Error(
      "Web Bluetooth is only available in supported browsers such as Chrome or Edge."
    );
  }

  let device: BluetoothDevice | null = null;
  let characteristic: BluetoothRemoteGATTCharacteristic | null = null;
  let notificationListener: ((event: Event) => void) | null = null;
  let disconnectHandled = false;

  const finalizeDisconnect = () => {
    if (!device || disconnectHandled) {
      return;
    }

    disconnectHandled = true;

    if (characteristic && notificationListener) {
      characteristic.removeEventListener(
        "characteristicvaluechanged",
        notificationListener
      );
    }

    device.removeEventListener("gattserverdisconnected", handleDisconnected);
    onDisconnected?.(device);
  };

  const handleDisconnected = () => {
    finalizeDisconnect();
  };

  try {
    device = await bluetooth.requestDevice(
      buildBeaconRequestOptions(expectedBeaconId, BLE_SERVICE_UUID)
    );

    if (device.name !== expectedBeaconId) {
      throw new Error("Wrong room beacon");
    }

    if (!device.gatt) {
      throw new Error("The selected beacon does not expose a GATT server.");
    }

    device.addEventListener("gattserverdisconnected", handleDisconnected);

    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(BLE_SERVICE_UUID);
    characteristic = await service.getCharacteristic(BLE_CHARACTERISTIC_UUID);

    if (onNotification) {
      notificationListener = (event: Event) => {
        const target = event.target as BluetoothRemoteGATTCharacteristic | null;
        if (!target?.value) {
          return;
        }

        onNotification(target.value, target);
      };

      characteristic.addEventListener(
        "characteristicvaluechanged",
        notificationListener
      );
    }

    try {
      await characteristic.startNotifications();
    } catch {
      // Notifications are optional for occupancy check-in, so the GATT
      // connection remains usable even if the firmware is read/write only.
    }

    return {
      characteristic,
      device,
      disconnect: async () => {
        if (disconnectHandled) {
          return;
        }

        if (device?.gatt?.connected) {
          device.gatt.disconnect();
        }

        finalizeDisconnect();
      },
      server,
      service,
    };
  } catch (error) {
    if (characteristic && notificationListener) {
      characteristic.removeEventListener(
        "characteristicvaluechanged",
        notificationListener
      );
    }

    if (device) {
      device.removeEventListener("gattserverdisconnected", handleDisconnected);
      if (device.gatt?.connected) {
        device.gatt.disconnect();
      }
    }

    throw new Error(getBluetoothErrorMessage(error));
  }
}

export { BLE_CHARACTERISTIC_UUID, BLE_SERVICE_UUID };
