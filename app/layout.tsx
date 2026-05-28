import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import Providers from "@/components/layout/Providers";
import "./globals.css";

const centuryGothicRegular = localFont({
  src: [
    {
      path: "./fonts/centurygothic.ttf",
      weight: "400",
      style: "normal",
    },
  ],
  variable: "--font-century-gothic",
  display: "swap",
});

const centuryGothicBold = localFont({
  src: [
    {
      path: "./fonts/centurygothic_bold.ttf",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-century-gothic-bold",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#f8f9fa",
};

export const metadata: Metadata = {
  title: {
    default: "iRoomReserve",
    template: "%s | iRoomReserve",
  },
  applicationName: "iRoomReserve",
  description: "Smart Room Reservation and Occupancy Monitoring System for St. Dominic College of Asia",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
};

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({
  children,
}: Readonly<RootLayoutProps>) {
  return (
    <html lang="en" className="bg-[#f8f9fa]">
      <body suppressHydrationWarning className={`min-h-screen bg-[#f8f9fa] ${centuryGothicRegular.variable} ${centuryGothicBold.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
