import type { Metadata } from "next"
import DashboardLayoutClient from "@/components/layout/DashboardLayoutClient";

export const metadata: Metadata = { title: "Dashboard" }

interface DashboardLayoutProps {
  children: React.ReactNode;
}

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({
  children
}: Readonly<DashboardLayoutProps>) {
  return <DashboardLayoutClient>{children}</DashboardLayoutClient>
}
