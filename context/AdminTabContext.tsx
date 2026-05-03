'use client';

import React, { createContext, useContext, useState } from 'react';
import type { AdminTab } from '@/components/NavBar';

interface AdminTabContextType {
  activeTab: AdminTab;
  setActiveTab: (tab: AdminTab) => void;
  selectedBuildingId: string;
  setSelectedBuildingId: (buildingId: string) => void;
}

interface AdminTabProviderProps {
  children: React.ReactNode;
}

const AdminTabContext = createContext<AdminTabContextType>({
  activeTab: 'dashboard',
  setActiveTab: () => {},
  selectedBuildingId: '',
  setSelectedBuildingId: () => {},
});

export function AdminTabProvider({ children }: Readonly<AdminTabProviderProps>) {
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [selectedBuildingId, setSelectedBuildingId] = useState('');
  return (
    <AdminTabContext.Provider
      value={{ activeTab, setActiveTab, selectedBuildingId, setSelectedBuildingId }}
    >
      {children}
    </AdminTabContext.Provider>
  );
}

export function useAdminTab() {
  return useContext(AdminTabContext);
}
