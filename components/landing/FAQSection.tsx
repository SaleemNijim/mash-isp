'use client'

import { ChevronDown } from 'lucide-react'
import { formatTrialPeriod } from '@/lib/public/format-trial'
import { FadeIn } from './FadeIn'

interface FAQSectionProps {
  trialDays?: number | null
}

function buildFaqItems(trialDays?: number | null) {
  const trialLabel = formatTrialPeriod(trialDays)
  const trialAnswer =
    trialDays != null && trialDays > 0
      ? `نعم! يمكنك البدء بـ${trialLabel} مع وصول كامل لكل مميزات Pro — مشتركون غير محدودون وبدون بطاقة ائتمان.`
      : 'نعم! يمكنك البدء بتجربة مجانية كاملة مع وصول لكل مميزات Pro — مشتركون غير محدودون وبدون بطاقة ائتمان.'

  return [
    {
      q: 'هل يمكنني تجربة ماش مجاناً؟',
      a: trialAnswer,
    },
    {
      q: 'هل بياناتي آمنة ومعزولة عن شركات أخرى؟',
      a: 'بالتأكيد. ماش يستخدم نظام Multi-Tenant مع Row Level Security على مستوى قاعدة البيانات — بيانات شركتك معزولة تماماً عن أي شركة أخرى.',
    },
    {
      q: 'كم عدد المشتركين الذي يدعمه النظام؟',
      a: 'عدد غير محدود من المشتركين في جميع الخطط، بما فيها التجربة المجانية — لا قيود على حجم شبكتك.',
    },
    {
      q: 'هل يدعم النظام اللغة العربية بالكامل؟',
      a: 'نعم، الواجهة بالكامل باللغة العربية مع دعم RTL كامل — مصممة خصيصاً للسوق العربي.',
    },
    {
      q: 'كيف يتم الدعم الفني؟',
      a: 'نوفر دعماً فنياً على مدار الساعة عبر WhatsApp والبريد الإلكتروني. عملاء الخطة الاحترافية يحصلون على دعم أولوي.',
    },
  ]
}

export function FAQSection({ trialDays }: FAQSectionProps) {
  const faqItems = buildFaqItems(trialDays)

  return (
    <section id="faq" className="landing-section bg-[#F8FFFE]" dir="rtl">
      <div className="landing-container max-w-3xl">
        <FadeIn className="mb-10 text-center">
          <span className="mb-3 inline-block text-sm font-bold text-[#0F6E56]">الأسئلة الشائعة</span>
          <h2 className="text-3xl font-bold text-[#0D1F1A] sm:text-[2rem]">أسئلة متكررة</h2>
        </FadeIn>

        <div className="space-y-3">
          {faqItems.map((item, i) => (
            <FadeIn key={item.q} delay={i * 0.05}>
              <details className="group overflow-hidden rounded-2xl border border-[#D1E8E2] bg-white">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 text-base font-bold text-[#0D1F1A] transition-colors hover:bg-[#F8FFFE]">
                  {item.q}
                  <ChevronDown className="size-5 shrink-0 text-[#4A6B60] transition-transform duration-200 group-open:rotate-180" />
                </summary>
                <div className="border-t border-[#D1E8E2] px-6 py-4 text-base leading-[1.7] text-[#4A6B60]">
                  {item.a}
                </div>
              </details>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  )
}
