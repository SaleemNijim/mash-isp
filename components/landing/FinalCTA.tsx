'use client'

import Link from 'next/link'
import { FadeIn } from './FadeIn'

export function FinalCTA() {
  return (
    <section className="relative overflow-hidden py-20 lg:py-24" dir="rtl">
      <div className="absolute inset-0 bg-gradient-to-bl from-[#0F6E56] via-[#1A9B77] to-[#0F6E56]" />
      <div className="pointer-events-none absolute inset-0 landing-dot-grid opacity-20" />

      <div className="landing-container relative text-center">
        <FadeIn>
          <h2 className="mb-4 text-3xl font-bold text-white sm:text-4xl">
            هل أنت مستعد لتحويل إدارة شبكتك؟
          </h2>
          <p className="mx-auto mb-8 max-w-xl text-base leading-[1.7] text-white/85">
            انضم إلى مزودي الإنترنت الذين يثقون بـ MASH ISP
          </p>
          <Link
            href="/register"
            className="inline-flex items-center justify-center rounded-xl bg-white px-8 py-4 text-base font-bold text-[#0F6E56] shadow-[0_4px_24px_rgba(0,0,0,0.15)] transition-all duration-200 hover:bg-[#F8FFFE] hover:shadow-[0_8px_32px_rgba(0,0,0,0.2)]"
          >
            ابدأ تجربتك المجانية اليوم
          </Link>
          <p className="mt-4 text-sm text-white/75">بدون بطاقة ائتمان · مشتركون غير محدودون</p>
        </FadeIn>
      </div>
    </section>
  )
}
