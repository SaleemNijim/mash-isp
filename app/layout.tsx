import type { Metadata } from "next";
import { Noto_Sans_Arabic, Geist } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const notoSansArabic = Noto_Sans_Arabic({
  variable: "--font-noto-arabic",
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "MASH ISP",
  description: "نظام إدارة شركات الإنترنت",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className={cn("h-full", "antialiased", notoSansArabic.variable, "font-sans", geist.variable)}>
      <body className="min-h-full flex flex-col font-[var(--font-noto-arabic)]">{children}</body>
    </html>
  );
}
