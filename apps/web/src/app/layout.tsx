import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

import { AuthProvider } from "@/components/auth-provider";
import { NotificationProvider } from "@/components/notifications/notifications-provider";
import { ThemeProvider } from "@/components/theme-provider";

const fontSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Arcto-CRM",
  description:
    "Arcto-CRM ist die reduzierte CRM-Oberfläche mit Landingpage, Dashboard und Einstellungen.",
  metadataBase: new URL("https://arcto-crm.example"),
  openGraph: {
    title: "Arcto-CRM",
    description: "Der Startpunkt für dein zukünftiges CRM-System",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" suppressHydrationWarning>
      <body className={`${fontSans.variable} bg-slate-950 text-slate-100`}>
        <ThemeProvider>
          <NotificationProvider>
            <AuthProvider>{children}</AuthProvider>
          </NotificationProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
