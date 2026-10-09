import Image from "next/image";

export default function LoadingScreen() {
  return (
    <main className="loading-screen" role="status" aria-live="polite" aria-label="Loading e-RoomReserve">
      <div className="loading-content">
        <div className="loading-logo" aria-hidden="true">
          <Image
            src="/images/eroomreserve-navbar-icon.png"
            alt=""
            width={512}
            height={512}
            priority
            className="loading-logo-image"
          />
          <svg className="loading-logo-outline" viewBox="0 0 512 512" fill="none">
            <path className="loading-logo-outline-track" d="M108 393V169L200 108H312L403 169V393H108Z" />
            <path className="loading-logo-outline-progress" d="M108 393V169L200 108H312L403 169V393H108Z" />
          </svg>
        </div>
        <h1 className="loading-brand">e-Room<span>Reserve</span></h1>
        <p className="loading-status">Preparing your space</p>
        <div className="loading-track" aria-hidden="true">
          <div className="loading-bar" />
        </div>
      </div>
    </main>
  );
}
