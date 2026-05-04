'use client';

import { AuthProvider } from '@/context/AuthContext';
import { AdminTabProvider } from '@/context/AdminTabContext';

interface ProvidersProps {
  children: React.ReactNode;
}

export default function Providers({ children }: Readonly<ProvidersProps>) {
  return (
    <AuthProvider>
      <AdminTabProvider>{children}</AdminTabProvider>
    </AuthProvider>
  );
}
