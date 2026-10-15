'use client';

import { useSyncExternalStore } from 'react';
import Image from 'next/image';

const ANDROID_INSTALL_URL =
  'https://expo.dev/accounts/iroomreserve.group4/projects/iroomreserve-mobile/builds/4ff75087-97c8-4507-82d4-8095d1959403';
const MOBILE_USER_AGENT = /(android|iphone|ipad|ipod|iemobile|mobile|opera mini|blackberry)/i;

function isMobileBrowser() {
  const { userAgent, platform, maxTouchPoints } = window.navigator;
  const isIPadOS = platform === 'MacIntel' && maxTouchPoints > 1;

  return MOBILE_USER_AGENT.test(userAgent) || isIPadOS;
}

function shouldShowPromotion() {
  return typeof window !== 'undefined' && isMobileBrowser();
}

const subscribeToDeviceIdentity = () => () => {};

interface MobileAppPromotionGateProps {
  children: React.ReactNode;
}

export default function MobileAppPromotionGate({
  children,
}: Readonly<MobileAppPromotionGateProps>) {
  const showPromotion = useSyncExternalStore(
    subscribeToDeviceIdentity,
    shouldShowPromotion,
    () => false
  );

  if (!showPromotion) {
    return children;
  }

  return (
    <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-[#343434] px-5 py-10 text-[#343434]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-br from-[#343434] via-[#625f5f] to-[#a12124]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(circle_at_top_left,rgba(161,33,36,0.35),transparent_55%),radial-gradient(circle_at_bottom_right,rgba(52,52,52,0.45),transparent_60%)]"
      />
      <section
        aria-labelledby="mobile-promotion-title"
        className="relative z-10 w-full max-w-md rounded-3xl border border-black/10 bg-white p-7 shadow-xl shadow-black/10 sm:p-9"
      >
        <div className="mb-8 flex items-center gap-3">
          <Image
            src="/images/eroomreserve-mobile-logo-transparent.png"
            alt="e-RoomReserve logo"
            width={96}
            height={96}
            className="h-20 w-20 shrink-0 object-contain"
            priority
          />
          <div>
            <p className="font-bold">e-RoomReserve</p>
            <p className="text-sm text-black/65">St. Dominic College of Asia</p>
          </div>
        </div>

        <p className="mb-2 text-sm font-bold uppercase tracking-wide text-[#8b1d20]">
          Mobile app
        </p>
        <h1 id="mobile-promotion-title" className="text-3xl font-bold leading-tight">
          Please install the e-RoomReserve mobile app.
        </h1>
        <p className="mt-4 text-base leading-relaxed text-black/70">
          Install the mobile app to access e-RoomReserve on your phone.
        </p>

        <div className="mt-8">
          <a
            href={ANDROID_INSTALL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#a12124] px-5 py-3 text-center font-bold text-white transition-colors hover:bg-[#811b1e] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a12124]"
          >
            Install e-RoomReserve
          </a>
        </div>
      </section>
    </main>
  );
}
