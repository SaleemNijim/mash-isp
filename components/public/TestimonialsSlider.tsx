'use client'

import { useState } from 'react'
import Link from 'next/link'

const TESTIMONIALS = [
  {
    name: 'أحمد الخطيب',
    role: 'مدير شركة نابلس نت',
    city: 'نابلس',
    text: 'قبل MASH ISP كنا نُدير كل شيء يدوياً على Excel. الآن أستطيع متابعة 400 مشترك وإيراداتهم في دقيقة واحدة.',
  },
  {
    name: 'محمد صالح',
    role: 'مالك شبكة الجنوب',
    city: 'غزة',
    text: 'ميزة البطاقات رائعة — أحسب المبيعات والموزعين تلقائياً. وفّرت علينا ساعات من العمل اليومي.',
  },
  {
    name: 'خالد العمري',
    role: 'مسؤول تقني، شركة سبيد',
    city: 'رام الله',
    text: 'مراقبة الشبكة وإشعارات MAC في الوقت الفعلي ساعدتنا على اكتشاف مشاكل الأجهزة قبل أن يشكو العملاء.',
  },
]

export function TestimonialsSlider() {
  const [active, setActive] = useState(0)

  const prev = () => setActive((a) => (a - 1 + TESTIMONIALS.length) % TESTIMONIALS.length)
  const next = () => setActive((a) => (a + 1) % TESTIMONIALS.length)

  const t = TESTIMONIALS[active]

  return (
    <>
      <section className="bg-mash-page py-20 lg:py-24 border-t border-mash-border">
        <div className="max-w-3xl mx-auto px-8 text-center">
          <span className="text-xs font-medium text-primary-600 mb-2 block">
            آراء العملاء
          </span>
          <h2 className="text-2xl sm:text-3xl font-medium text-mash-text mb-10">
            ماذا يقول مستخدمونا
          </h2>

          <div className="relative bg-mash-surface rounded-xl border border-mash-border px-8 py-10 min-h-[200px] flex flex-col items-center justify-center">
            <p className="text-base text-mash-text-secondary leading-relaxed mb-6">
              «{t.text}»
            </p>
            <div className="flex flex-col items-center gap-1">
              <div className="w-10 h-10 rounded-full bg-primary-50 flex items-center justify-center text-primary-800 font-medium text-lg">
                {t.name[0]}
              </div>
              <p className="font-medium text-mash-text mt-2">{t.name}</p>
              <p className="text-sm text-mash-text-muted">
                {t.role} — {t.city}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-center gap-4 mt-6">
            <button
              onClick={prev}
              aria-label="السابق"
              className="w-11 h-11 rounded-lg border border-mash-border bg-mash-surface flex items-center justify-center text-mash-text-muted hover:border-primary-100 hover:text-primary-600 transition-colors"
            >
              ›
            </button>
            <div className="flex gap-2">
              {TESTIMONIALS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActive(i)}
                  aria-label={`انتقل إلى الشهادة ${i + 1}`}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    i === active ? 'bg-primary-600' : 'bg-mash-border'
                  }`}
                />
              ))}
            </div>
            <button
              onClick={next}
              aria-label="التالي"
              className="w-11 h-11 rounded-lg border border-mash-border bg-mash-surface flex items-center justify-center text-mash-text-muted hover:border-primary-100 hover:text-primary-600 transition-colors"
            >
              ‹
            </button>
          </div>
        </div>
      </section>

      <section className="bg-mash-surface py-20 border-t border-mash-border">
        <div className="max-w-3xl mx-auto px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-medium text-mash-text mb-4">
            جاهز لتحويل إدارة شركتك؟
          </h2>
          <p className="text-base text-mash-text-secondary mb-8 max-w-xl mx-auto">
            ابدأ اليوم مجاناً — لا بطاقة ائتمان، لا التزامات. تجربة كاملة
            بوصول لجميع المميزات.
          </p>
          <Link href="/register" className="mash-btn-primary text-base px-10">
            ابدأ مجاناً
          </Link>
          <p className="mt-4 text-xs text-mash-text-muted">
            تجربة مجانية كاملة · لا تحتاج بطاقة ائتمان
          </p>
        </div>
      </section>
    </>
  )
}
