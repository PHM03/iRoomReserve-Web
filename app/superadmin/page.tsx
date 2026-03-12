'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Superadmin logs in from the regular login page (Admin tab).
// This page just redirects to the main login.
export default function SuperAdminRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-gray-500">Redirecting to login...</p>
    </div>
  );
}
