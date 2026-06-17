import type { Metadata } from 'next'
import Link from 'next/link'
import { HeroSection } from '@/components/public/HeroSection'
import { FeaturesGrid } from '@/components/public/FeaturesGrid'
import { LandingPricingCards } from '@/components/public/LandingPricingCards'
import { TestimonialsSlider } from '@/components/public/TestimonialsSlider'

export const metadata: Metadata = {
  title: 'MASH ISP — نظام إدارة شركات الإنترنت',
  description:
    'نظام SaaS متكامل لإدارة المشتركين، البطاقات، الشبكة، والتقارير. ابدأ بتجربة مجانية كاملة — لا بطاقة ائتمان.',
}

export default function LandingPage() {
  return (
    <>
      <HeroSection />
      <FeaturesGrid />

      <section className="bg-mash-page py-20 border-t border-mash-border" dir="rtl">
        <div className="max-w-6xl mx-auto px-8">
          <div className="text-center mb-12">
            <span className="text-xs font-medium text-primary-600 mb-2 block">
              الأسعار
            </span>
            <h2 className="text-2xl sm:text-3xl font-medium text-mash-text mb-3">
              خطط مرنة لكل حجم شركة
            </h2>
            <p className="text-base text-mash-text-secondary max-w-xl mx-auto">
              تجربة مجانية كاملة ثم اختر الخطة المناسبة — شهري أو سنوي — بدون
              قيود على عدد المشتركين.
            </p>
          </div>

          <LandingPricingCards />

          <div className="mt-10 text-center">
            <Link href="/pricing" className="mash-btn-secondary">
              مقارنة كاملة بين الخطط
            </Link>
          </div>
        </div>
      </section>

      <TestimonialsSlider />
    </>
  )
}
