import Image from "next/image";

export default function LoadingScreen() {
  return (
    <main className="loading-screen" role="status" aria-live="polite" aria-label="Loading eRoomReserve">
      <div className="loading-content">
        <div className="loading-logo" aria-hidden="true">
          <Image
            src="/images/eroomreserve-loading-logo.png"
            alt=""
            width={480}
            height={480}
            priority
            className="loading-logo-image"
          />
          <svg className="loading-logo-outline" viewBox="0 0 480 480" fill="none">
            <path className="loading-logo-outline-track" d="M143 352 L143 201 L211 157 M277 157 L340 201 L340 352 L143 352" />
            <path className="loading-logo-outline-progress" d="M143 352 L143 201 L211 157 M277 157 L340 201 L340 352 L143 352" />
          </svg>
        </div>
        <h1 className="loading-brand"><span>e</span>RoomReserve</h1>
        <p className="loading-status">Preparing your workspace</p>
        <div className="loading-track" aria-hidden="true">
          <div className="loading-bar" />
        </div>
      </div>
    </main>
  );
}
