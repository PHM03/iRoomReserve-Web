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
    <div className={`flex items-center gap-2 ${className}`.trim()}>
      <label
        htmlFor={buttonId}
        className={`shrink-0 text-sm font-bold text-gray-700 ${
          disabled ? 'opacity-60' : ''
        }`}
      >
        {label}
      </label>
      <div ref={rootRef} className="relative">
        <button
          type="button"
          id={buttonId}
          disabled={disabled}
          onClick={() => {
            if (!disabled) {
              setIsOpen((current) => !current);
            }
          }}
          className={`flex min-w-44 items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-all focus:border-[#a12124] focus:outline-none focus:ring-2 focus:ring-[#a12124]/30 disabled:cursor-not-allowed disabled:opacity-60 ${
            elevated && isOpen ? 'shadow-[0_8px_24px_rgba(161,33,36,0.12)]' : ''
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
            className={`absolute z-50 mt-2 min-w-full overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-lg ${
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
                  className={`cursor-pointer px-4 py-2.5 text-sm transition-colors hover:bg-[#a12124]/5 hover:text-[#a12124] ${
                    isSelected
                      ? 'bg-[#a12124]/10 font-bold text-[#a12124]'
                      : 'font-medium text-gray-700'
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
