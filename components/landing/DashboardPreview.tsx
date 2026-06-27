'use client'

import { motion } from 'framer-motion'
import {
  LayoutDashboard,
  Users,
  Bell,
  Wifi,
  CreditCard,
  Settings,
} from 'lucide-react'
import { FadeIn } from './FadeIn'

const FLOATING_STATS = [
  { label: 'مشتركون غير محدودون', position: 'top-8 -right-4 lg:-right-8' },
  { label: '٩٨.٧٪ uptime', position: 'top-1/3 -left-4 lg:-left-10' },
  { label: 'تنبيهات فورية', position: 'bottom-12 -right-2 lg:-right-6' },
]

function DashboardMockup() {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#D1E8E2] bg-white shadow-[0_20px_60px_rgba(15,110,86,0.15)]">
      <div className="flex items-center gap-2 border-b border-[#D1E8E2] bg-[#F8FFFE] px-4 py-3">
        <div className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-red-400/70" />
          <span className="size-2.5 rounded-full bg-amber-400/70" />
          <span className="size-2.5 rounded-full bg-emerald-500/70" />
        </div>
        <span className="mr-auto text-xs text-[#4A6B60]">app.mash-isp.com/dashboard</span>
      </div>

      <div className="flex min-h-[320px]">
        <aside className="hidden w-44 shrink-0 border-l border-[#D1E8E2] bg-[#F8FFFE] p-3 sm:block">
          <div className="mb-4 flex items-center gap-2 px-2">
            <Wifi className="size-4 text-[#0F6E56]" />
            <span className="text-xs font-bold text-[#0D1F1A]">MASH ISP</span>
          </div>
          {[
            { icon: LayoutDashboard, label: 'لوحة التحكم', active: true },
            { icon: Users, label: 'المشتركون' },
            { icon: CreditCard, label: 'المدفوعات' },
            { icon: Bell, label: 'التنبيهات' },
            { icon: Settings, label: 'الإعدادات' },
          ].map((item) => (
            <div
              key={item.label}
              className={`mb-1 flex items-center gap-2 rounded-lg px-2 py-2 text-[11px] ${
                item.active
                  ? 'bg-[#E8F5F1] font-bold text-[#0F6E56]'
                  : 'text-[#4A6B60]'
              }`}
            >
              <item.icon className="size-3.5" />
              {item.label}
            </div>
          ))}
        </aside>

        <main className="flex-1 p-4">
          <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
            {[
              ['المشتركون', 'غير محدود'],
              ['الإيرادات', '$12.4K'],
              ['التنبيهات', '12'],
              ['Uptime', '98.7%'],
            ].map(([label, val]) => (
              <div
                key={label}
                className="rounded-xl border border-[#D1E8E2] bg-[#F8FFFE] p-3"
              >
                <p className="text-[10px] text-[#4A6B60]">{label}</p>
                <p className="text-sm font-bold text-[#0D1F1A]">{val}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-[#D1E8E2]">
            <div className="border-b border-[#D1E8E2] px-3 py-2 text-[11px] font-bold text-[#0D1F1A]">
              آخر المشتركين
            </div>
            <div className="divide-y divide-[#D1E8E2]">
              {[
                ['أحمد الخطيب', '192.168.1.45', 'نشط'],
                ['سارة ناصر', '192.168.1.88', 'متأخر'],
                ['محمود عودة', '192.168.1.12', 'نشط'],
                ['ليلى حمدان', '192.168.1.67', 'نشط'],
              ].map(([name, ip, status]) => (
                <div
                  key={name}
                  className="flex items-center justify-between px-3 py-2 text-[10px]"
                >
                  <span className="font-medium text-[#0D1F1A]">{name}</span>
                  <span className="font-mono text-[#4A6B60]" dir="ltr">
                    {ip}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[9px] font-medium ${
                      status === 'نشط'
                        ? 'bg-[#10B981]/15 text-[#10B981]'
                        : 'bg-[#F59E0B]/15 text-[#F59E0B]'
                    }`}
                  >
                    {status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

export function DashboardPreview() {
  return (
    <section
      id="dashboard-preview"
      className="landing-section relative overflow-hidden bg-white"
      dir="rtl"
    >
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="size-[600px] rounded-full bg-[#E8F5F1]/50 blur-3xl" />
      </div>

      <div className="landing-container relative">
        <FadeIn className="mb-14 text-center">
          <span className="mb-3 inline-block text-sm font-bold text-[#0F6E56]">لوحة التحكم</span>
          <h2 className="mb-4 text-3xl font-bold text-[#0D1F1A] sm:text-[2rem]">
            لوحة تحكم مصممة للمحترفين
          </h2>
          <p className="mx-auto max-w-2xl text-base leading-[1.7] text-[#4A6B60]">
            واجهة نظيفة وسريعة تجمع كل ما يحتاجه مشغّل شبكة الإنترنت — بدون قيود على عدد
            المشتركين
          </p>
        </FadeIn>

        <div className="relative mx-auto max-w-4xl">
          {FLOATING_STATS.map((stat, i) => (
            <motion.div
              key={stat.label}
              className={`absolute z-10 hidden rounded-xl border border-[#D1E8E2] bg-white px-4 py-3 shadow-[0_8px_32px_rgba(15,110,86,0.12)] md:block ${stat.position}`}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 + i * 0.15, duration: 0.5 }}
            >
              <p className="text-sm font-bold text-[#0F6E56]">{stat.label}</p>
            </motion.div>
          ))}

          <FadeIn delay={0.1}>
            <DashboardMockup />
          </FadeIn>

          <p className="mt-8 text-center text-sm text-[#4A6B60]">
            أدِر شبكتك بالكامل —{' '}
            <span className="font-bold text-[#0F6E56]">عدد غير محدود من المشتركين</span>
          </p>
        </div>
      </div>
    </section>
  )
}
