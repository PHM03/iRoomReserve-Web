'use client';

import React from 'react';
import { useESP32Bluetooth } from '@/hooks/useESP32Bluetooth';
import { formatStatusLabel } from '@/lib/esp32Data';

const COMMAND_BUTTONS = [
  {
    label: 'Get Count',
    command: 'COUNT',
    className: 'ui-button-blue'
  },
  {
    label: 'Get Status',
    command: 'STATUS',
    className: 'ui-button-gray'
  },
  {
    label: 'Reset',
    command: 'RESET',
    className: 'ui-button-red'
  },
];

const CONNECTION_BADGE_CLASSES = {
  connected: 'ui-badge-green',
  connecting: 'ui-badge-orange',
  disconnected: 'ui-badge-red',
};

function getRoomStatusPresentation(occupancyCount) {
  return occupancyCount > 0
    ? {
        label: 'Occupied',
        badgeClassName: 'ui-badge-green',
        dotClassName: 'bg-green-500',
        textClassName: 'ui-text-green',
        description: 'The room currently has active occupancy.',
      }
    : {
        label: 'Available',
        badgeClassName: 'ui-badge-gray',
        dotClassName: 'bg-gray-400',
        textClassName: 'ui-text-gray',
        description: 'The room is currently available.',
      };
}

function SurfaceCard({ children, className = '' }) {
  return (
    <div className={`rounded-2xl border border-dark/10 bg-white/70 p-5 ${className}`.trim()}>
      {children}
    </div>
  );
}

function SectionHeading({ eyebrow, title, description }) {
  return (
    <div>
      <p className="text-sm font-bold text-black/70">{eyebrow}</p>
      <h2 className="mt-1 text-2xl font-bold text-black">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm text-black/70">{description}</p>
    </div>
  );
}

function StatusPill({ children, className }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold ${className}`.trim()}
    >
      {children}
    </span>
  );
}

function MetricCard({ label, children, footer }) {
  return (
    <SurfaceCard>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-black/50">
        {label}
      </p>
      <div className="mt-3">{children}</div>
      {footer ? <p className="mt-3 text-sm text-black/70">{footer}</p> : null}
    </SurfaceCard>
  );
}

function DetailRow({ label, value, valueClassName = '' }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="font-bold text-black">{label}</dt>
      <dd className={`text-right ${valueClassName}`.trim()}>{value}</dd>
    </div>
  );
}

function CommandButton({ label, className, disabled, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${className} rounded-xl px-4 py-3 disabled:cursor-not-allowed disabled:opacity-50`.trim()}
    >
      {label}
    </button>
  );
}

export default function ESP32Dashboard() {
  const {
    connectionStatus,
    deviceName,
    deviceState,
    errorMessage,
    canSendCommands,
    connectToESP32,
    sendESP32Command,
    disconnectFromESP32,
  } = useESP32Bluetooth();

  const roomStatus = getRoomStatusPresentation(deviceState.occupancyCount);
  const connectionBadgeClassName =
    CONNECTION_BADGE_CLASSES[connectionStatus] ?? CONNECTION_BADGE_CLASSES.disconnected;

  return (
    <section className="glass-card w-full p-6 sm:p-8">
      <div className="flex flex-col gap-4 border-b border-dark/10 pb-6 sm:flex-row sm:items-start sm:justify-between">
        <SectionHeading
          eyebrow="ESP32 Bluetooth Monitor"
          title="Real-Time Occupancy Dashboard"
          description="Connect directly to the ESP32 over Web Bluetooth to read live occupancy messages and send device commands from Chrome."
        />

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={connectToESP32}
            disabled={connectionStatus === 'connecting'}
            className="btn-primary px-5 py-3 disabled:cursor-not-allowed"
          >
            {connectionStatus === 'connecting'
              ? 'Connecting...'
              : 'Connect Bluetooth'}
          </button>
          <button
            type="button"
            onClick={disconnectFromESP32}
            disabled={connectionStatus === 'disconnected'}
            className="ui-button-red rounded-xl px-5 py-3 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Disconnect
          </button>
        </div>
      </div>

      {errorMessage ? (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Connection" footer={deviceName}>
          <StatusPill className={connectionBadgeClassName}>
            {formatStatusLabel(connectionStatus)}
          </StatusPill>
        </MetricCard>

        <MetricCard label="Occupancy Count" footer="People currently detected">
          <p className="text-4xl font-bold text-black">{deviceState.occupancyCount}</p>
        </MetricCard>

        <MetricCard label="Room Status">
          <div className="flex items-center gap-3">
            <span className={`h-3 w-3 rounded-full ${roomStatus.dotClassName}`} />
            <StatusPill className={roomStatus.badgeClassName}>
              {roomStatus.label}
            </StatusPill>
          </div>
          <p className={`mt-3 text-sm font-bold ${roomStatus.textClassName}`}>
            {roomStatus.description}
          </p>
        </MetricCard>

        <MetricCard
          label="Alerts"
          footer={
            deviceState.alertCode
              ? `Alert code: ${deviceState.alertCode}`
              : 'No alert received from the ESP32 yet.'
          }
        >
          <p className="text-lg font-bold text-black">{deviceState.alert}</p>
        </MetricCard>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <SurfaceCard>
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-black">Device Controls</h3>
              <p className="mt-1 text-sm text-black/70">
                Send commands directly to the ESP32 characteristic.
              </p>
            </div>
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-black/40">
              BLE Write
            </span>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            {COMMAND_BUTTONS.map((button) => (
              <CommandButton
                key={button.command}
                label={button.label}
                className={button.className}
                disabled={!canSendCommands}
                onClick={() => sendESP32Command(button.command)}
              />
            ))}
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <h3 className="text-lg font-bold text-black">Live Details</h3>
          <dl className="mt-4 space-y-3 text-sm text-black/75">
            <DetailRow
              label="Reported Status"
              value={formatStatusLabel(deviceState.status)}
            />
            <DetailRow label="Device Time" value={deviceState.time} />
            <DetailRow
              label="Last Message"
              value={deviceState.raw || 'Waiting for live BLE data'}
              valueClassName="max-w-[15rem] break-words"
            />
          </dl>
        </SurfaceCard>
      </div>
    </section>
  );
}
