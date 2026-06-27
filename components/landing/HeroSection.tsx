'use client'

import Link from 'next/link'
import {
  Bell,
  Network,
  TrendingUp,
  Users,
  CreditCard,
  Router,
} from 'lucide-react'
import { FadeIn } from './FadeIn'
import { formatTrialPeriod } from '@/lib/public/format-trial'

const ISP_LOGOS = [
  'شبكة القدس',
  'فلسطين نت',
  'رام الله واي فاي',
  'نابلس كونكت',
  'غزة نت',
  'بيت لحم نت',
  'الخليل ISP',
  'جنين لينك',
]

function HeroDashboard() {
  return (
    <div className="landing-float relative mx-auto w-full max-w-lg">
      <div className="overflow-hidden rounded-2xl border border-[#D1E8E2] bg-white shadow-[0_8px_40px_rgba(15,110,86,0.14)]">
        <div className="flex items-center gap-2 border-b border-[#D1E8E2] bg-[#F8FFFE] px-4 py-3">
          <div className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-[#F59E0B]/60" />
            <span className="size-2.5 rounded-full bg-[#10B981]/60" />
            <span className="size-2.5 rounded-full bg-[#0F6E56]/60" />
          </div>
          <span className="mr-auto text-xs text-[#4A6B60]">لوحة التحكم — MASH ISP</span>
          <span className="relative">
            <Bell className="size-4 text-[#0F6E56]" />
            <span className="absolute -top-1 -left-1 flex size-3.5 items-center justify-center rounded-full bg-[#F59E0B] text-[8px] font-bold text-white">
              3
            </span>
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 p-3">
          {[
            { label: 'مشتركون نشطون', value: '∞', icon: Users },
            { label: 'إيرادات الشهر', value: '$4.2K', icon: TrendingUp },
            { label: 'Uptime', value: '98.7%', icon: Network },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-[#D1E8E2] bg-[#F8FFFE] p-2.5"
            >
              <stat.icon className="mb-1 size-3.5 text-[#0F6E56]" />
              <p className="text-sm font-bold text-[#0D1F1A]">{stat.value}</p>
              <p className="text-[10px] leading-tight text-[#4A6B60]">{stat.label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-[1fr_120px] gap-2 px-3 pb-3">
          <div className="rounded-xl border border-[#D1E8E2] bg-white p-2">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-bold text-[#0D1F1A]">المشتركون</span>
              <CreditCard className="size-3 text-[#4A6B60]" />
            </div>
            <div className="space-y-1.5">
              {[
                ['أحمد خ.', 'نشط', '#10B981'],
                ['سارة م.', 'متأخر', '#F59E0B'],
                ['محمود ع.', 'نشط', '#10B981'],
              ].map(([name, status, color]) => (
                <div
                  key={name}
                  className="flex items-center justify-between rounded-lg bg-[#F8FFFE] px-2 py-1.5 text-[10px]"
                >
                  <span className="font-medium text-[#0D1F1A]">{name}</span>
                  <span className="rounded-full px-1.5 py-0.5 text-[9px] font-medium text-white" style={{ backgroundColor: color }}>
                    {status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-[#D1E8E2] bg-[#E8F5F1] p-2">
            <div className="mb-2 flex items-center gap-1">
              <Router className="size-3 text-[#0F6E56]" />
              <span className="text-[10px] font-bold text-[#0D1F1A]">الشبكة</span>
            </div>
            <div className="relative h-[88px]">
              <div className="absolute left-1/2 top-2 size-6 -translate-x-1/2 rounded-lg border-2 border-[#0F6E56] bg-white" />
              <div className="absolute left-2 top-10 size-4 rounded-full border border-[#1A9B77] bg-white" />
              <div className="absolute right-2 top-10 size-4 rounded-full border border-[#1A9B77] bg-white" />
              <div className="absolute bottom-2 left-1/2 size-4 -translate-x-1/2 rounded-full border border-[#10B981] bg-[#10B981]/20" />
              <svg className="absolute inset-0 size-full text-[#0F6E56]/40" aria-hidden>
                <line x1="50%" y1="20%" x2="15%" y2="55%" stroke="currentColor" strokeWidth="1" />
                <line x1="50%" y1="20%" x2="85%" y2="55%" stroke="currentColor" strokeWidth="1" />
                <line x1="50%" y1="20%" x2="50%" y2="78%" stroke="currentColor" strokeWidth="1" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute -bottom-4 -right-4 rounded-xl border border-[#D1E8E2] bg-white px-3 py-2 shadow-lg">
        <p className="text-[10px] text-[#4A6B60]">تنبيه MAC</p>
        <p className="text-xs font-bold text-[#0D1F1A]">جهاز جديد مكتشف</p>
      </div>
    </div>
  )
}

function SocialProofBar() {
  const logos = [...ISP_LOGOS, ...ISP_LOGOS]

  return (
    <section className="border-y border-[#D1E8E2] bg-[#F8FFFE] py-8" dir="rtl">
      <div className="landing-container mb-5 text-center">
        <p className="text-sm font-medium text-[#4A6B60]">
          يثق بنا أكثر من <span className="font-bold text-[#0F6E56]">٥٠</span> مزود إنترنت
        </p>
      </div>
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-[#F8FFFE] to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-[#F8FFFE] to-transparent" />
        <div className="landing-marquee-track flex w-max gap-10 px-4">
          {logos.map((name, i) => (
            <span
              key={`${name}-${i}`}
              className="whitespace-nowrap text-sm font-bold text-[#4A6B60]/70"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

interface HeroSectionProps {
  trialDays?: number | null
}

export function HeroSection({ trialDays }: HeroSectionProps) {
  const trustBadges = [
    trialDays != null && trialDays > 0 ? formatTrialPeriod(trialDays) : 'تجربة مجانية كاملة',
    'بدون بطاقة ائتمان',
    'مشتركون غير محدودون',
    'دعم 24/7',
  ]

  return (
    <>
      <section className="landing-dot-grid relative overflow-hidden bg-white pt-12 pb-16 lg:pt-16 lg:pb-20" dir="rtl">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#E8F5F1]/40 via-transparent to-transparent" />

        <div className="landing-container relative">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            <FadeIn>
              <span className="mb-5 inline-flex items-center gap-2 rounded-full bg-[#E8F5F1] px-4 py-1.5 text-xs font-bold text-[#0F6E56]">
                <span className="size-1.5 rounded-full bg-[#1A9B77]" aria-hidden />
                ابدأ مع ماش — أول منصة SaaS لمزودي الإنترنت الفلسطينيين
              </span>

              <h1 className="mb-5 text-4xl font-bold leading-[1.25] text-[#0D1F1A] sm:text-5xl lg:text-[3rem]">
                إدارة مزودي الإنترنت
                <span className="mt-1 block text-[#0F6E56]">بذكاء واحترافية</span>
              </h1>

              <p className="mb-1 text-sm font-medium tracking-wide text-[#4A6B60] uppercase" dir="ltr">
                Multi-Tenant ISP Management Platform
              </p>

              <p className="mb-8 max-w-xl text-base leading-[1.7] text-[#4A6B60]">
                منصة متكاملة لإدارة المشتركين، الفوترة، أجهزة الشبكة، والعمليات اليومية —
                مصممة خصيصاً لمزودي الإنترنت في فلسطين والعالم العربي.
              </p>

              <div className="mb-6 flex flex-col gap-3 sm:flex-row">
                <Link href="/register" className="landing-btn-primary text-center">
                  ابدأ مجاناً
                </Link>
                <a href="#dashboard-preview" className="landing-btn-secondary text-center">
                  شاهد العرض التوضيحي
                </a>
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {trustBadges.map((badge) => (
                  <span
                    key={badge}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-[#4A6B60]"
                  >
                    <span className="size-1.5 rounded-full bg-[#10B981]" aria-hidden />
                    {badge}
                  </span>
                ))}
              </div>
            </FadeIn>

            <FadeIn delay={0.15} className="flex justify-center lg:justify-start">
              <HeroDashboard />
            </FadeIn>
          </div>
        </div>
      </section>

      <SocialProofBar />
    </>
  )
}
