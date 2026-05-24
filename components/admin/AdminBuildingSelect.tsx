'use client';

import AdminFloorFilter from '@/components/admin/AdminFloorFilter';

interface AdminBuildingSelectOption {
  label: string;
  value: string;
}

interface AdminBuildingSelectProps {
  label: string;
  options: AdminBuildingSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  menuAlign?: 'left' | 'right';
  fullWidth?: boolean;
}

export default function AdminBuildingSelect({
  label,
  options,
  value,
  onChange,
  placeholder = 'Select Building',
  className = '',
  disabled = false,
  menuAlign = 'left',
  fullWidth = false,
}: Readonly<AdminBuildingSelectProps>) {
  return (
    <AdminFloorFilter
      label={label}
      options={options}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={className}
      disabled={disabled}
      menuAlign={menuAlign}
      fullWidth={fullWidth}
    />
  );
}
