'use client';

import { AuthProvider } from '@/context/AuthContext';
import { AdminTabProvider } from '@/context/AdminTabContext';
import MobileAppPromotionGate from '@/components/layout/MobileAppPromotionGate';

interface ProvidersProps {
  children: React.ReactNode;
}

export default function Providers({ children }: Readonly<ProvidersProps>) {
  return (
    <AuthProvider>
      <AdminTabProvider>
        <MobileAppPromotionGate>{children}</MobileAppPromotionGate>
      </AdminTabProvider>
    </AuthProvider>
  );
}
