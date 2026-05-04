import type { Metadata } from "next"
import DashboardLayoutClient from "./DashboardLayoutClient"

export const metadata: Metadata = {
  title: "IRoomReserve | Dashboard",
}

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: Readonly<DashboardLayoutProps>) {
  return <DashboardLayoutClient>{children}</DashboardLayoutClient>
}
