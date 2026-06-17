import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const cairo = Cairo({
  variable: "--font-sans",
  subsets: ["arabic", "latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: {
    default: "MASH ISP — نظام إدارة شركات الإنترنت",
    template: "%s | MASH ISP",
  },
  description:
    "نظام SaaS متكامل لإدارة شركات الإنترنت — مشتركون، بطاقات، شبكة، تقارير، وأكثر.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className={cn("h-full antialiased", cairo.variable)}>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
