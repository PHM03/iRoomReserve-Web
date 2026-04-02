'use client';

import { useEffect, useRef, useState } from 'react';
import {
  connectESP32,
  disconnect,
  sendCommand,
  startReading,
} from '@/lib/bluetooth';
import {
  applyESP32Update,
  createInitialESP32State,
  parseESP32Data,
} from '@/lib/esp32Data';

const DEFAULT_DEVICE_NAME = 'No device connected';

function getErrorMessage(error, fallbackMessage) {
  return error instanceof Error ? error.message : fallbackMessage;
}

export function useESP32Bluetooth() {
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [deviceName, setDeviceName] = useState(DEFAULT_DEVICE_NAME);
  const [deviceState, setDeviceState] = useState(() => createInitialESP32State());
  const [errorMessage, setErrorMessage] = useState('');
  const [isSendingCommand, setIsSendingCommand] = useState(false);
  const deviceRef = useRef(null);
  const dataListenerRef = useRef(null);
  const disconnectListenerRef = useRef(null);

  if (!dataListenerRef.current) {
    dataListenerRef.current = (rawMessage) => {
      const parsedData = parseESP32Data(rawMessage);

      setDeviceState((currentState) => applyESP32Update(currentState, parsedData));

      if (parsedData.connectionType) {
        setConnectionStatus(parsedData.connectionType);
      }

      setErrorMessage('');
    };
  }

  if (!disconnectListenerRef.current) {
    disconnectListenerRef.current = () => {
      setConnectionStatus('disconnected');
      setDeviceState((currentState) => ({
        ...currentState,
        status: 'disconnected',
        connectionType: 'disconnected',
      }));
    };
  }

  function detachDisconnectListener(targetDevice = deviceRef.current) {
    targetDevice?.removeEventListener(
      'gattserverdisconnected',
      disconnectListenerRef.current
    );
  }

  function attachDisconnectListener(targetDevice) {
    detachDisconnectListener(targetDevice);
    targetDevice.addEventListener(
      'gattserverdisconnected',
      disconnectListenerRef.current
    );
  }

  function resetDashboardState() {
    setConnectionStatus('disconnected');
    setDeviceName(DEFAULT_DEVICE_NAME);
    setDeviceState(createInitialESP32State());
  }

  useEffect(() => {
    return () => {
      detachDisconnectListener();
      void disconnect();
    };
  }, []);

  async function connectToESP32() {
    setErrorMessage('');
    setConnectionStatus('connecting');

    try {
      const connectedDevice = await connectESP32();

      if (deviceRef.current && deviceRef.current !== connectedDevice) {
        detachDisconnectListener(deviceRef.current);
      }

      attachDisconnectListener(connectedDevice);

      deviceRef.current = connectedDevice;
      setDeviceName(connectedDevice.name || 'ESP32 Device');

      await startReading(dataListenerRef.current);

      setConnectionStatus('connected');
      setDeviceState((currentState) => ({
        ...currentState,
        status: 'connected',
        connectionType: 'connected',
      }));
    } catch (error) {
      resetDashboardState();
      setErrorMessage(
        getErrorMessage(error, 'Unable to connect to the ESP32 device.')
      );
    }
  }

  async function sendESP32Command(command) {
    setErrorMessage('');
    setIsSendingCommand(true);

    try {
      await sendCommand(command);
    } catch (error) {
      setErrorMessage(
        getErrorMessage(error, `Unable to send the ${command} command.`)
      );
    } finally {
      setIsSendingCommand(false);
    }
  }

  async function disconnectFromESP32() {
    setErrorMessage('');

    try {
      detachDisconnectListener();
      await disconnect();
      deviceRef.current = null;
      resetDashboardState();
    } catch (error) {
      setErrorMessage(
        getErrorMessage(error, 'Unable to disconnect from the ESP32 device.')
      );
    }
  }

  return {
    connectionStatus,
    deviceName,
    deviceState,
    errorMessage,
    isSendingCommand,
    canSendCommands: connectionStatus === 'connected' && !isSendingCommand,
    connectToESP32,
    sendESP32Command,
    disconnectFromESP32,
  };
}
