import Link from 'next/link'
import { Wifi } from 'lucide-react'
import type { ReactNode } from 'react'

interface AuthShellProps {
  children: ReactNode
  maxWidth?: 'sm' | 'md'
}

export function AuthShell({ children, maxWidth = 'sm' }: AuthShellProps) {
  return (
    <div className="landing-dot-grid relative flex min-h-screen flex-col items-center justify-center bg-white px-4 py-12" dir="rtl">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#E8F5F1]/50 via-transparent to-transparent" />

      <Link
        href="/"
        className="relative mb-8 flex items-center gap-2.5 transition-opacity hover:opacity-80"
      >
        <span className="flex size-10 items-center justify-center rounded-xl bg-[#E8F5F1] text-[#0F6E56]">
          <Wifi className="size-5" strokeWidth={2.25} />
        </span>
        <span className="text-xl font-bold text-[#0D1F1A]">MASH ISP</span>
      </Link>

      <div
        className={`relative w-full ${maxWidth === 'md' ? 'max-w-lg' : 'max-w-[440px]'}`}
      >
        <div className="overflow-hidden rounded-2xl border border-[#D1E8E2] bg-white p-8 shadow-[0_8px_32px_rgba(15,110,86,0.08)]">
          {children}
        </div>
      </div>

      <p className="relative mt-8 text-center text-xs text-[#4A6B60]">
        منصة SaaS لمزودي الإنترنت في فلسطين والعالم العربي
      </p>
    </div>
  )
}
