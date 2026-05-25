'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';

import type { FloorOption } from '@/lib/buildings/floorLabels';

interface AdminFloorFilterProps {
  label: string;
  options: FloorOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  elevated?: boolean;
  menuAlign?: 'left' | 'right';
  fullWidth?: boolean;
}

export default function AdminFloorFilter({
  label,
  options,
  value,
  onChange,
  placeholder = 'Select Floor',
  className = '',
  disabled = false,
  elevated = true,
  menuAlign = 'left',
  fullWidth = false,
}: Readonly<AdminFloorFilterProps>) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonId = useId();

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value),
    [options, value]
  );

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('click', handleDocumentClick);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('click', handleDocumentClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div className={`flex items-center gap-2 ${fullWidth ? 'w-full' : ''} ${className}`.trim()}>
      {label ? (
        <label
          htmlFor={buttonId}
          className={`shrink-0 text-sm font-bold text-gray-700 ${
            disabled ? 'opacity-60' : ''
          }`}
        >
          {label}
        </label>
      ) : null}
      <div ref={rootRef} className={`relative ${fullWidth ? 'w-full' : ''}`.trim()}>
        <button
          type="button"
          id={buttonId}
          disabled={disabled}
          onClick={() => {
            if (!disabled) {
              setIsOpen((current) => !current);
            }
          }}
          className={`flex ${fullWidth ? 'w-full' : 'min-w-44'} items-center justify-between gap-3 rounded-xl border border-white/55 bg-white/85 px-4 py-2.5 text-sm font-medium text-gray-800 shadow-[0_8px_22px_rgba(15,23,42,0.08)] backdrop-blur-xl transition-all hover:bg-white focus:border-[#a12124] focus:outline-none focus:ring-2 focus:ring-[#a12124]/25 disabled:cursor-not-allowed disabled:opacity-60 ${
            elevated && isOpen ? 'shadow-[0_18px_44px_rgba(15,23,42,0.18)]' : ''
          }`}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
        >
          <span>{selectedOption?.label ?? placeholder}</span>
          <svg
            className={`h-4 w-4 text-[#a12124] transition-transform ${
              isOpen ? 'rotate-180' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              d="M6 9l6 6 6-6"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
            />
          </svg>
        </button>

        {isOpen && !disabled ? (
          <div
            className={`dashboard-dropdown absolute z-50 mt-2 min-w-full overflow-hidden rounded-2xl ${
              menuAlign === 'right' ? 'right-0' : 'left-0'
            }`}
            role="listbox"
            aria-labelledby={buttonId}
          >
            {options.map((option, index) => {
              const isSelected = option.value === value;

              return (
                <div
                  key={option.value}
                  role="option"
                  tabIndex={0}
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onChange(option.value);
                      setIsOpen(false);
                    }
                  }}
                  className={`dashboard-dropdown-item cursor-pointer px-4 py-2.5 text-sm ${
                    isSelected
                      ? 'bg-[#a12124]/10 font-bold text-[#7f1d1d]'
                      : 'font-medium text-gray-800'
                  } ${index === 0 ? 'rounded-t-2xl' : ''} ${
                    index === options.length - 1 ? 'rounded-b-2xl' : ''
                  }`}
                >
                  {option.label}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
