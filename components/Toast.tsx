'use client';

import React, { useEffect, useState } from 'react';

interface ToastProps {
  message: string;
  type?: 'success' | 'error';
  show: boolean;
  onClose: () => void;
  duration?: number;
}

export default function Toast({ message, type = 'success', show, onClose, duration = 3000 }: Readonly<ToastProps>) {
  const [visible, setVisible] = useState(false);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    let animationFrame = 0;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    let closeTimer: ReturnType<typeof setTimeout> | undefined;

    if (show) {
      animationFrame = requestAnimationFrame(() => {
        setVisible(true);
        requestAnimationFrame(() => setAnimating(true));
      });

      hideTimer = setTimeout(() => {
        setAnimating(false);
        closeTimer = setTimeout(() => {
          setVisible(false);
          onClose();
        }, 300);
      }, duration);
    } else {
      animationFrame = requestAnimationFrame(() => {
        setAnimating(false);
        setVisible(false);
      });
    }

    return () => {
      cancelAnimationFrame(animationFrame);
      if (hideTimer) clearTimeout(hideTimer);
      if (closeTimer) clearTimeout(closeTimer);
    };
  }, [show, duration, onClose]);

  if (!visible) return null;

  const toastStyle = type === 'success'
    ? {
        container: 'border-green-500/90 bg-[#dff3e4] text-[#1f3a28] shadow-[0_14px_36px_rgba(52,52,52,0.12)]',
        iconWrap: 'bg-[#c6e8cf] text-green-950 border border-green-500/70',
      }
    : {
        container: 'border-red-300/90 bg-[#fff6f6] text-[#343434] shadow-[0_14px_36px_rgba(52,52,52,0.12)]',
        iconWrap: 'bg-red-100 text-red-700 border border-red-200',
      };

  const icon = type === 'success' ? (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  ) : (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] flex justify-center pointer-events-none">
      <div
        className={`mt-4 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-bold pointer-events-auto backdrop-blur-xl transition-all duration-300 ease-in-out ${toastStyle.container} ${
          animating
            ? 'translate-y-0 opacity-100'
            : '-translate-y-4 opacity-0'
        }`}
      >
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${toastStyle.iconWrap}`}>
          {icon}
        </span>
        <span className="leading-5 text-[#343434]">{message}</span>
      </div>
    </div>
  );
}
