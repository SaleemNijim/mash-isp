'use client'

import { FadeIn } from './FadeIn'

const STEPS = [
  {
    number: '١',
    title: 'أنشئ حسابك',
    description: 'سجّل شركتك في دقائق',
  },
  {
    number: '٢',
    title: 'أضف مشتركيك',
    description: 'استورد بياناتك أو أضفها يدوياً',
  },
  {
    number: '٣',
    title: 'ابدأ الإدارة',
    description: 'تحكم في كل شيء من لوحة واحدة',
  },
]

export function HowItWorks() {
  return (
    <section id="why-mash" className="landing-section bg-[#F8FFFE]" dir="rtl">
      <div className="landing-container">
        <FadeIn className="mb-14 text-center">
          <span className="mb-3 inline-block text-sm font-bold text-[#0F6E56]">كيف يعمل</span>
          <h2 className="text-3xl font-bold text-[#0D1F1A] sm:text-[2rem]">كيف يعمل ماش؟</h2>
        </FadeIn>

        <div className="relative">
          <div
            className="absolute top-8 right-[16.67%] left-[16.67%] hidden h-0.5 bg-gradient-to-l from-[#0F6E56] via-[#1A9B77] to-[#0F6E56] lg:block"
            aria-hidden
          />

          <div className="grid gap-10 lg:grid-cols-3 lg:gap-8">
            {STEPS.map((step, i) => (
              <FadeIn key={step.title} delay={i * 0.1} className="relative text-center">
                <div className="relative z-10 mx-auto mb-5 flex size-16 items-center justify-center rounded-full border-4 border-[#E8F5F1] bg-[#0F6E56] text-xl font-bold text-white shadow-[0_4px_16px_rgba(15,110,86,0.3)]">
                  {step.number}
                </div>
                <h3 className="mb-2 text-xl font-bold text-[#0D1F1A]">{step.title}</h3>
                <p className="text-base leading-[1.7] text-[#4A6B60]">{step.description}</p>
              </FadeIn>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
