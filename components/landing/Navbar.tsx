'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Menu, Wifi, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV_LINKS = [
  { href: '#features', label: 'المميزات' },
  { href: '#pricing', label: 'الأسعار' },
  { href: '#why-mash', label: 'لماذا ماش' },
  { href: '#contact', label: 'تواصل معنا' },
]

export function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={cn(
        'sticky top-0 z-50 transition-all duration-300',
        scrolled
          ? 'border-b border-[#D1E8E2]/80 bg-white/75 backdrop-blur-xl shadow-[0_2px_20px_rgba(15,110,86,0.06)]'
          : 'bg-transparent'
      )}
      dir="rtl"
    >
      <div className="landing-container flex h-[72px] items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <span className="flex size-9 items-center justify-center rounded-xl bg-[#E8F5F1] text-[#0F6E56]">
            <Wifi className="size-5" strokeWidth={2.25} />
          </span>
          <span className="text-lg font-bold tracking-tight text-[#0D1F1A]">MASH ISP</span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-[#4A6B60] transition-colors hover:text-[#0F6E56]"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Link
            href="/login"
            className="text-sm font-medium text-[#4A6B60] transition-colors hover:text-[#0D1F1A]"
          >
            تسجيل دخول
          </Link>
          <Link href="/register" className="landing-btn-primary !py-2.5 !px-5">
            ابدأ تجربتك المجانية
          </Link>
        </div>

        <button
          type="button"
          className="inline-flex size-10 items-center justify-center rounded-xl border border-[#D1E8E2] text-[#0D1F1A] md:hidden"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label={mobileOpen ? 'إغلاق القائمة' : 'فتح القائمة'}
        >
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-[#D1E8E2] bg-white/95 px-6 py-4 backdrop-blur-xl md:hidden">
          <nav className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-lg px-3 py-3 text-sm font-medium text-[#4A6B60] hover:bg-[#E8F5F1] hover:text-[#0F6E56]"
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <Link
              href="/login"
              className="rounded-lg px-3 py-3 text-sm font-medium text-[#4A6B60] hover:bg-[#E8F5F1]"
              onClick={() => setMobileOpen(false)}
            >
              تسجيل دخول
            </Link>
            <Link
              href="/register"
              className="landing-btn-primary mt-2 text-center"
              onClick={() => setMobileOpen(false)}
            >
              ابدأ تجربتك المجانية
            </Link>
          </nav>
        </div>
      )}
    </header>
  )
}
