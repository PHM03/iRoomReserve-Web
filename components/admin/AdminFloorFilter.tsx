'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';

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

const DROPDOWN_VIEWPORT_MARGIN_PX = 16;
const DROPDOWN_OFFSET_PX = 8;
const DROPDOWN_MIN_WIDTH_PX = 176;
const DROPDOWN_MAX_HEIGHT_PX = 320;
const DROPDOWN_ITEM_HEIGHT_PX = 44;
const DROPDOWN_CHROME_HEIGHT_PX = 16;

interface AdminDropdownMenuStyleInput {
  buttonRect: Pick<DOMRect, 'bottom' | 'left' | 'right' | 'top' | 'width'>;
  menuAlign: 'left' | 'right';
  optionCount: number;
  viewportHeight: number;
  viewportWidth: number;
}

export function buildAdminDropdownMenuStyle({
  buttonRect,
  menuAlign,
  optionCount,
  viewportHeight,
  viewportWidth,
}: Readonly<AdminDropdownMenuStyleInput>): CSSProperties {
  const maxViewportWidth = Math.max(
    DROPDOWN_MIN_WIDTH_PX,
    viewportWidth - DROPDOWN_VIEWPORT_MARGIN_PX * 2
  );
  const menuWidth = Math.min(
    maxViewportWidth,
    Math.max(buttonRect.width, DROPDOWN_MIN_WIDTH_PX)
  );
  const desiredMenuHeight = Math.min(
    DROPDOWN_MAX_HEIGHT_PX,
    optionCount * DROPDOWN_ITEM_HEIGHT_PX + DROPDOWN_CHROME_HEIGHT_PX
  );
  const spaceBelow = Math.max(
    0,
    viewportHeight -
      buttonRect.bottom -
      DROPDOWN_OFFSET_PX -
      DROPDOWN_VIEWPORT_MARGIN_PX
  );
  const spaceAbove = Math.max(
    0,
    buttonRect.top - DROPDOWN_OFFSET_PX - DROPDOWN_VIEWPORT_MARGIN_PX
  );
  const shouldOpenUpward =
    spaceBelow < desiredMenuHeight && spaceAbove > spaceBelow;
  const availableHeight = shouldOpenUpward ? spaceAbove : spaceBelow;
  const unclampedLeft =
    menuAlign === 'right' ? buttonRect.right - menuWidth : buttonRect.left;
  const left = Math.min(
    Math.max(DROPDOWN_VIEWPORT_MARGIN_PX, unclampedLeft),
    Math.max(
      DROPDOWN_VIEWPORT_MARGIN_PX,
      viewportWidth - menuWidth - DROPDOWN_VIEWPORT_MARGIN_PX
    )
  );

  return {
    position: 'fixed',
    left,
    width: menuWidth,
    maxHeight: Math.max(0, Math.min(DROPDOWN_MAX_HEIGHT_PX, availableHeight)),
    overflowY: 'auto',
    zIndex: 9999,
    ...(shouldOpenUpward
      ? {
          bottom: viewportHeight - buttonRect.top + DROPDOWN_OFFSET_PX,
        }
      : {
          top: buttonRect.bottom + DROPDOWN_OFFSET_PX,
        }),
  };
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
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({
    position: 'fixed',
    zIndex: 9999,
  });
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const buttonId = useId();

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value),
    [options, value]
  );
  const canRenderPortal = typeof document !== 'undefined';

  const updateMenuPosition = useCallback(() => {
    if (!buttonRef.current) {
      return;
    }

    setMenuStyle(
      buildAdminDropdownMenuStyle({
        buttonRect: buttonRef.current.getBoundingClientRect(),
        menuAlign,
        optionCount: options.length,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
      })
    );
  }, [menuAlign, options.length]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    updateMenuPosition();

    window.addEventListener('scroll', updateMenuPosition, true);
    window.addEventListener('resize', updateMenuPosition);

    return () => {
      window.removeEventListener('scroll', updateMenuPosition, true);
      window.removeEventListener('resize', updateMenuPosition);
    };
  }, [isOpen, updateMenuPosition]);

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      if (
        !rootRef.current?.contains(event.target as Node) &&
        !menuRef.current?.contains(event.target as Node)
      ) {
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

  const handleButtonClick = () => {
    if (disabled) {
      return;
    }

    if (!isOpen) {
      updateMenuPosition();
    }

    setIsOpen((current) => !current);
  };

  const dropdownMenu = (
    <div
      ref={menuRef}
      className="dashboard-dropdown overflow-hidden rounded-2xl"
      style={menuStyle}
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
  );

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
          ref={buttonRef}
          type="button"
          id={buttonId}
          disabled={disabled}
          onClick={handleButtonClick}
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

        {canRenderPortal && isOpen && !disabled && createPortal(dropdownMenu, document.body)}
      </div>
    </div>
  );
}
