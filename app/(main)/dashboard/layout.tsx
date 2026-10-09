import { Suspense } from "react";
import type { Metadata } from "next";
import DashboardLayoutClient from "@/components/layout/DashboardLayoutClient";
import LoadingScreen from "@/components/ui/LoadingScreen";

export const metadata: Metadata = { title: "Dashboard" };

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({
  children
}: Readonly<DashboardLayoutProps>) {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <DashboardLayoutClient>{children}</DashboardLayoutClient>
    </Suspense>
  );
}
