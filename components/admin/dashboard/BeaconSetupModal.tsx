'use client';

import { useState } from 'react';

interface BeaconSetupModalProps {
  roomId: string;
  roomName: string;
  beaconId: string;
  initialWifiSsid: string;
  initialWifiPassword: string;
  onWifiCredentialsChange: (ssid: string, password: string) => void;
  onClose: () => void;
}

interface FirmwarePart {
  path: string;
  address: number;
}

interface FirmwareManifest {
  version: string;
  board: string;
  flashSize: '4MB';
  flashMode: 'dio';
  flashFrequency: '40m';
  files: FirmwarePart[];
}

interface BrowserSerialPort {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
}

interface BrowserSerialApi {
  requestPort(): Promise<BrowserSerialPort>;
}

const FIRMWARE_DIRECTORY = '/hardware/firmware/doit-esp32-devkit-v1';

async function sendProvisioningOverSerial(
  port: BrowserSerialPort,
  values: { wifiSsid: string; wifiPassword: string; roomId: string; roomName: string; beaconId: string },
) {
  await port.open({ baudRate: 115200 });
  const reader = port.readable?.getReader();
  const writer = port.writable?.getWriter();
  if (!reader || !writer) {
    await reader?.cancel().catch(() => undefined);
    reader?.releaseLock();
    writer?.releaseLock();
    await port.close().catch(() => undefined);
    throw new Error('The serial connection could not be opened for setup data.');
  }

  const decoder = new TextDecoder();
  let output = '';
  const timeoutId = window.setTimeout(() => {
    void reader.cancel().catch(() => undefined);
  }, 20000);

  try {
    await new Promise((resolve) => window.setTimeout(resolve, 1400));
    const lines = [
      'ERROOMRESERVE_SETUP_V1',
      `wifiSsid=${encodeURIComponent(values.wifiSsid)}`,
      `wifiPassword=${encodeURIComponent(values.wifiPassword)}`,
      `roomId=${encodeURIComponent(values.roomId)}`,
      `roomName=${encodeURIComponent(values.roomName)}`,
      `beaconId=${encodeURIComponent(values.beaconId)}`,
      '',
    ];
    await writer.write(new TextEncoder().encode(lines.join('\n')));

    while (!output.includes('ROOMRESERVE_CONFIG_SAVED')) {
      const { value, done } = await reader.read();
      if (done) break;
      output += decoder.decode(value, { stream: true });
      if (output.includes('ROOMRESERVE_CONFIG_ERROR')) {
        throw new Error(output.match(/ROOMRESERVE_CONFIG_ERROR[^\r\n]*/)?.[0] ?? 'The ESP32 rejected the setup data.');
      }
    }
    if (!output.includes('ROOMRESERVE_CONFIG_SAVED')) {
      throw new Error('No setup confirmation arrived from the ESP32. Check the USB cable and try again.');
    }
  } catch {
    if (output.includes('ROOMRESERVE_CONFIG_ERROR')) {
      throw new Error(output.match(/ROOMRESERVE_CONFIG_ERROR[^\r\n]*/)?.[0] ?? 'The ESP32 rejected the setup data.');
    }
    if (output.includes('ROOMRESERVE_CONFIG_SAVED')) return;
    throw new Error('No setup confirmation arrived from the ESP32. Check the USB cable and try again.');
  } finally {
    window.clearTimeout(timeoutId);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
    writer.releaseLock();
    await port.close().catch(() => undefined);
  }
}

export default function BeaconSetupModal({
  roomId,
  roomName,
  beaconId,
  initialWifiSsid,
  initialWifiPassword,
  onWifiCredentialsChange,
  onClose,
}: Readonly<BeaconSetupModalProps>) {
  const [status, setStatus] = useState('Enter the Wi-Fi details, then connect the ESP32 by USB.');
  const [phase, setPhase] = useState<'ready' | 'flashing' | 'provisioning' | 'complete' | 'error'>('ready');
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [wifiSsid, setWifiSsid] = useState(initialWifiSsid);
  const [wifiPassword, setWifiPassword] = useState(initialWifiPassword);
  const [showWifiPassword, setShowWifiPassword] = useState(false);

  const isBusy = phase === 'flashing' || phase === 'provisioning';

  const flashFirmware = async () => {
    if (!wifiSsid.trim()) {
      setErrorMessage('Enter the Wi-Fi network name before installing.');
      return;
    }

    setErrorMessage('');
    setProgress(0);
    setPhase('flashing');

    const serial = (navigator as Navigator & { serial?: BrowserSerialApi }).serial;
    if (!serial) {
      setPhase('error');
      setErrorMessage('USB flashing requires Chrome or Edge on a secure page (HTTPS or localhost).');
      return;
    }

    let port: BrowserSerialPort | null = null;
    let transport: { disconnect(): Promise<void> } | null = null;
    try {
      setStatus('Choose the ESP32 serial port in the browser dialog.');
      port = await serial.requestPort();

      const { ESPLoader, Transport } = await import('esptool-js');
      const manifestResponse = await fetch(`${FIRMWARE_DIRECTORY}/manifest.json`, { cache: 'no-store' });
      if (!manifestResponse.ok) throw new Error('Could not load the ESP32 firmware manifest.');
      const manifest = await manifestResponse.json() as FirmwareManifest;

      const files = await Promise.all(manifest.files.map(async (part) => {
        const response = await fetch(`${FIRMWARE_DIRECTORY}/${part.path}`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Could not load ${part.path}.`);
        return {
          address: part.address,
          data: new Uint8Array(await response.arrayBuffer()),
        };
      }));

      const espTransport = new Transport(
        port as unknown as ConstructorParameters<typeof Transport>[0],
        true,
      );
      transport = espTransport;

      const esploader = new ESPLoader({
        transport: espTransport,
        baudrate: 115200,
        terminal: {
          clean: () => undefined,
          writeLine: (line: string) => setStatus(line.slice(0, 180)),
          write: (line: string) => setStatus(line.slice(0, 180)),
        },
      });

      const chipName = await esploader.main();
      if (!chipName.toLowerCase().includes('esp32')) {
        throw new Error(`Expected an ESP32, but detected ${chipName}.`);
      }

      setStatus(`Flashing ${manifest.board} firmware…`);
      const writtenByFile = files.map(() => 0);
      const totalBytes = files.reduce((sum, file) => sum + file.data.length, 0);
      await esploader.writeFlash({
        fileArray: files,
        flashMode: manifest.flashMode,
        flashFreq: manifest.flashFrequency,
        flashSize: manifest.flashSize,
        eraseAll: true,
        compress: true,
        reportProgress: (fileIndex, written) => {
          writtenByFile[fileIndex] = written;
          const completedBytes = writtenByFile.reduce((sum, current) => sum + current, 0);
          setProgress(Math.min(100, Math.round((completedBytes / totalBytes) * 100)));
        },
      });

      setStatus('Firmware installed. Sending Wi-Fi and room settings over USB…');
      setPhase('provisioning');
      await esploader.after('hard_reset');
      await espTransport.disconnect();
      transport = null;
      await sendProvisioningOverSerial(port, {
        wifiSsid: wifiSsid.trim(),
        wifiPassword,
        roomId,
        roomName,
        beaconId,
      });
      setPhase('complete');
      setStatus('Firmware installed. Wi-Fi and room settings were saved over USB; the beacon is restarting.');
    } catch (error) {
      if (transport) await transport.disconnect().catch(() => undefined);
      if (port) await port.close().catch(() => undefined);
      setPhase('error');
      setErrorMessage(error instanceof Error ? error.message : 'Firmware installation failed.');
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" role="presentation">
      <div
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="beacon-setup-title"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-blue-700">ESP32 setup</p>
            <h2 id="beacon-setup-title" className="mt-1 text-xl font-bold text-black">Set up {roomName}</h2>
            <p className="mt-1 text-sm text-black/65">Beacon ID: {beaconId}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            aria-label="Close setup"
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-bold text-gray-700 disabled:opacity-50"
          >
            Close
          </button>
        </div>

        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          Flashing replaces the current firmware and erases saved Wi-Fi and room settings on this ESP32.
        </div>

        <ol className="mt-5 space-y-2 text-sm text-black/75">
          <li><strong>1.</strong> Connect the DOIT ESP32 DEVKIT to this computer with USB.</li>
          <li><strong>2.</strong> Enter the Wi-Fi network details below.</li>
          <li><strong>3.</strong> Install. The selected room and Wi-Fi details are sent to the ESP32 over USB.</li>
        </ol>

        {phase !== 'complete' ? (
          <div className="mt-5">
            <p className="text-sm font-semibold text-black" aria-live="polite">{status}</p>
            <label className="mt-4 block text-sm font-semibold text-black" htmlFor="beacon-wifi-ssid">Wi-Fi network name</label>
            <input
              id="beacon-wifi-ssid"
              type="text"
              autoComplete="off"
              maxLength={32}
              value={wifiSsid}
              onChange={(event) => {
                const nextSsid = event.target.value;
                setWifiSsid(nextSsid);
                onWifiCredentialsChange(nextSsid, wifiPassword);
              }}
              disabled={isBusy}
              className="glass-input mt-1.5 w-full px-4 py-2.5 text-sm disabled:opacity-60"
            />
            <label className="mt-3 block text-sm font-semibold text-black" htmlFor="beacon-wifi-password">Wi-Fi password</label>
            <div className="relative mt-1.5">
              <input
                id="beacon-wifi-password"
                type={showWifiPassword ? 'text' : 'password'}
                autoComplete="new-password"
                maxLength={64}
                value={wifiPassword}
                onChange={(event) => {
                  const nextPassword = event.target.value;
                  setWifiPassword(nextPassword);
                  onWifiCredentialsChange(wifiSsid, nextPassword);
                }}
                disabled={isBusy}
                className="glass-input w-full px-4 py-2.5 pr-12 text-sm disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => setShowWifiPassword((visible) => !visible)}
                disabled={isBusy}
                aria-label={showWifiPassword ? 'Hide Wi-Fi password' : 'Show Wi-Fi password'}
                aria-pressed={showWifiPassword}
                className="absolute inset-y-0 right-2 flex items-center rounded-md px-2 text-gray-600 hover:text-gray-950 disabled:opacity-50"
              >
                {showWifiPassword ? (
                  <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 3l18 18M10.6 10.7a2 2 0 002.7 2.7M9.9 5.2A10.8 10.8 0 0112 5c5 0 8.5 4.5 9.5 7-.4 1.1-1.2 2.3-2.3 3.4M6.2 6.2C4.3 7.4 3 9.2 2.5 12c.8 2.1 3.5 6 9.5 6 1 0 2-.2 2.9-.5" />
                  </svg>
                ) : (
                  <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z" />
                    <circle cx="12" cy="12" r="2.5" strokeWidth={1.8} />
                  </svg>
                )}
              </button>
            </div>
            {phase === 'flashing' ? (
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-200">
                <div className="h-full bg-blue-700 transition-all" style={{ width: `${progress}%` }} />
              </div>
            ) : null}
            {phase === 'provisioning' ? <p className="mt-3 text-xs text-black/60">Waiting for the ESP32 to confirm it saved the settings…</p> : null}
            {errorMessage ? <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{errorMessage}</p> : null}
            <button
              type="button"
              onClick={() => void flashFirmware()}
              disabled={isBusy}
              className="mt-4 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60"
            >
              {phase === 'flashing' ? `Installing… ${progress}%` : phase === 'provisioning' ? 'Sending setup over USB…' : 'Connect and install firmware'}
            </button>
          </div>
        ) : null}

        {phase === 'complete' ? (
          <div className="mt-5 space-y-4" aria-live="polite">
            <p className="text-sm font-semibold text-green-800">{status}</p>
            <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-950">
              <p><strong>Room:</strong> {roomName}</p>
              <p className="mt-1"><strong>Beacon:</strong> {beaconId}</p>
              <p className="mt-1"><strong>Wi-Fi:</strong> {wifiSsid}</p>
            </div>
            <p className="text-xs text-black/65">No Wi-Fi connection is needed on this computer. The ESP32 received its setup details directly over USB.</p>
            <p className="text-xs text-black/55">DOIT ESP32 DEVKIT V1 · Flash bundle 1.1.0-usb-provisioning</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
