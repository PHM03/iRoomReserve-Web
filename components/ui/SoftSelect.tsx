'use client';

import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import AdminFloorFilter from '@/components/admin/AdminFloorFilter';

interface SoftSelectProps {
  'aria-label'?: string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  onChange: (event: { target: { value: string } }) => void;
  value: string;
}

export default function SoftSelect({
  'aria-label': ariaLabel,
  children,
  className = '',
  disabled = false,
  onChange,
  value,
}: Readonly<SoftSelectProps>) {
  const options = Children.toArray(children)
    .filter((child) => isValidElement<{ value?: string | number; children?: ReactNode }>(child))
    .map((child) => {
      const option = child as ReactElement<{
        value?: string | number;
        children?: ReactNode;
      }>;
      const label = option.props.children;
      const text = typeof label === 'string' || typeof label === 'number'
        ? String(label).trim()
        : '';

      return {
        label: text,
        value: String(option.props.value ?? text),
      };
    })
    .filter((option) => option.label.length > 0);

  return (
    <AdminFloorFilter
      label=""
      ariaLabel={ariaLabel}
      options={options}
      value={value}
      onChange={(nextValue) => onChange({ target: { value: nextValue } })}
      disabled={disabled}
      elevated={false}
      fullWidth={className.includes('w-full')}
      triggerClassName={`min-w-0 rounded-xl px-3 py-2 text-sm shadow-none ${className}`.trim()}
    />
  );
}
