'use client'

import { Quote, Star } from 'lucide-react'
import { FadeIn } from './FadeIn'

const TESTIMONIALS = [
  {
    name: 'محمد أبو سالم',
    company: 'شبكة القدس نت',
    quote:
      'ماش غيّر طريقة إدارتنا للمشتركين بالكامل. أصبحت عمليات التجديد والفوترة تتم في دقائق بدلاً من ساعات.',
    initials: 'مأ',
  },
  {
    name: 'لينا حمدان',
    company: 'رام الله واي فاي',
    quote:
      'تتبع MAC والإشعارات الفورية أنقذنا من مشاكل كثيرة. المنصة مصممة فعلاً لاحتياجات مزودي الإنترنت.',
    initials: 'له',
  },
  {
    name: 'خالد ناصر',
    company: 'نابلس كونكت',
    quote:
      'الدعم الفني ممتاز والواجهة العربية واضحة. فريقنا تعلّم استخدام النظام في يوم واحد فقط.',
    initials: 'خن',
  },
]

function Stars() {
  return (
    <div className="flex gap-0.5" aria-label="تقييم 5 من 5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className="size-4 fill-[#F59E0B] text-[#F59E0B]" />
      ))}
    </div>
  )
}

export function TestimonialsSection() {
  return (
    <section className="landing-section bg-white" dir="rtl">
      <div className="landing-container">
        <FadeIn className="mb-14 text-center">
          <span className="mb-3 inline-block text-sm font-bold text-[#0F6E56]">آراء العملاء</span>
          <h2 className="text-3xl font-bold text-[#0D1F1A] sm:text-[2rem]">ماذا يقول عملاؤنا</h2>
        </FadeIn>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {TESTIMONIALS.map((item, i) => (
            <FadeIn key={item.name} delay={i * 0.08}>
              <article className="landing-card relative h-full">
                <Quote className="mb-4 size-8 text-[#0F6E56]/30" />
                <p className="mb-6 text-base leading-[1.7] text-[#4A6B60]">&ldquo;{item.quote}&rdquo;</p>
                <div className="flex items-center gap-3">
                  <div className="flex size-11 items-center justify-center rounded-full bg-[#E8F5F1] text-sm font-bold text-[#0F6E56]">
                    {item.initials}
                  </div>
                  <div>
                    <p className="font-bold text-[#0D1F1A]">{item.name}</p>
                    <p className="text-sm text-[#4A6B60]">{item.company}</p>
                    <Stars />
                  </div>
                </div>
              </article>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  )
}
