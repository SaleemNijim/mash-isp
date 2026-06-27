import Link from 'next/link'
import { Wifi, MessageCircle } from 'lucide-react'

const PRODUCT_LINKS = [
  { href: '#features', label: 'المميزات' },
  { href: '#pricing', label: 'الأسعار' },
  { href: '/features', label: 'التفاصيل الكاملة' },
  { href: '/pricing', label: 'مقارنة الخطط' },
]

const COMPANY_LINKS = [
  { href: '#why-mash', label: 'لماذا ماش' },
  { href: '/register', label: 'إنشاء حساب' },
  { href: '/login', label: 'تسجيل دخول' },
]

const RESOURCE_LINKS = [
  { href: '#faq', label: 'الأسئلة الشائعة' },
  { href: '/features', label: 'دليل المميزات' },
  { href: '/pricing', label: 'الأسعار والخطط' },
]

const CONTACT_LINKS = [
  { href: '/contact', label: 'تواصل معنا' },
  { href: 'mailto:support@mash-isp.com', label: 'support@mash-isp.com' },
]

function LinkedinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 114.127 0 2.063 2.063 0 01-2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  )
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

export function Footer() {
  return (
    <footer id="contact" className="border-t border-[#D1E8E2] bg-white pt-16 pb-8" dir="rtl">
      <div className="landing-container">
        <div className="mb-12 grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-1">
            <Link href="/" className="mb-4 flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-xl bg-[#E8F5F1] text-[#0F6E56]">
                <Wifi className="size-5" strokeWidth={2.25} />
              </span>
              <span className="text-lg font-bold text-[#0D1F1A]">MASH ISP</span>
            </Link>
            <p className="text-sm leading-[1.7] text-[#4A6B60]">
              منصة متكاملة لإدارة شبكات الإنترنت — مصممة لمزودي الخدمة في فلسطين والعالم
              العربي.
            </p>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-bold text-[#0D1F1A]">المنتج</h3>
            <ul className="space-y-2.5">
              {PRODUCT_LINKS.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-[#4A6B60] transition-colors hover:text-[#0F6E56]"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-bold text-[#0D1F1A]">الشركة</h3>
            <ul className="space-y-2.5">
              {COMPANY_LINKS.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-[#4A6B60] transition-colors hover:text-[#0F6E56]"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-bold text-[#0D1F1A]">الموارد</h3>
            <ul className="space-y-2.5">
              {RESOURCE_LINKS.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-[#4A6B60] transition-colors hover:text-[#0F6E56]"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-bold text-[#0D1F1A]">تواصل معنا</h3>
            <ul className="mb-5 space-y-2.5">
              {CONTACT_LINKS.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-[#4A6B60] transition-colors hover:text-[#0F6E56]"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="flex gap-3">
              <a
                href="https://linkedin.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex size-9 items-center justify-center rounded-lg border border-[#D1E8E2] text-[#4A6B60] transition-colors hover:border-[#0F6E56] hover:text-[#0F6E56]"
                aria-label="LinkedIn"
              >
                <LinkedinIcon className="size-4" />
              </a>
              <a
                href="https://x.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex size-9 items-center justify-center rounded-lg border border-[#D1E8E2] text-[#4A6B60] transition-colors hover:border-[#0F6E56] hover:text-[#0F6E56]"
                aria-label="X (Twitter)"
              >
                <XIcon className="size-4" />
              </a>
              <a
                href="https://wa.me"
                target="_blank"
                rel="noopener noreferrer"
                className="flex size-9 items-center justify-center rounded-lg border border-[#D1E8E2] text-[#4A6B60] transition-colors hover:border-[#0F6E56] hover:text-[#0F6E56]"
                aria-label="WhatsApp"
              >
                <MessageCircle className="size-4" />
              </a>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-3 border-t border-[#D1E8E2] pt-6 sm:flex-row">
          <p className="text-xs text-[#4A6B60]">© 2025 MASH ISP. جميع الحقوق محفوظة.</p>
          <p className="text-xs text-[#4A6B60]">صُنع بفخر لقطاع الإنترنت الفلسطيني</p>
        </div>
      </div>
    </footer>
  )
}
