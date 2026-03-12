'use client';

import React, { useEffect, useState } from 'react';

interface ToastProps {
  message: string;
  type?: 'success' | 'error';
  show: boolean;
  onClose: () => void;
  duration?: number;
}

export default function Toast({ message, type = 'success', show, onClose, duration = 3000 }: ToastProps) {
  const [visible, setVisible] = useState(false);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (show) {
      setVisible(true);
      // Trigger slide-in animation on next frame
      requestAnimationFrame(() => setAnimating(true));

      const timer = setTimeout(() => {
        setAnimating(false);
        // Wait for slide-out animation to finish before hiding
        setTimeout(() => {
          setVisible(false);
          onClose();
        }, 300);
      }, duration);

      return () => clearTimeout(timer);
    } else {
      setAnimating(false);
      setVisible(false);
    }
  }, [show, duration, onClose]);

  if (!visible) return null;

  const bgColor = type === 'success'
    ? 'bg-green-500'
    : 'bg-red-500';

  const icon = type === 'success' ? (
    <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  ) : (
    <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex justify-center pointer-events-none">
      <div
        className={`mt-4 flex items-center gap-2 px-5 py-3 rounded-lg shadow-lg text-white text-sm font-medium pointer-events-auto transition-all duration-300 ease-in-out ${bgColor} ${
          animating
            ? 'translate-y-0 opacity-100'
            : '-translate-y-4 opacity-0'
        }`}
      >
        {icon}
        {message}
      </div>
    </div>
  );
}
