import type { Metadata } from 'next'
import { Navbar } from '@/components/landing/Navbar'
import { HeroSection } from '@/components/landing/HeroSection'
import { FeaturesSection } from '@/components/landing/FeaturesSection'
import { HowItWorks } from '@/components/landing/HowItWorks'
import { DashboardPreview } from '@/components/landing/DashboardPreview'
import { PricingSection } from '@/components/landing/PricingSection'
import { TestimonialsSection } from '@/components/landing/TestimonialsSection'
import { FAQSection } from '@/components/landing/FAQSection'
import { FinalCTA } from '@/components/landing/FinalCTA'
import { Footer } from '@/components/landing/Footer'
import { getSubscriptionPlans } from '@/lib/public/plans'

export const metadata: Metadata = {
  title: 'MASH ISP — إدارة مزودي الإنترنت بذكاء',
  description:
    'منصة SaaS متكاملة لإدارة المشتركين، الفوترة، أجهزة الشبكة، والعمليات — مصممة لمزودي الإنترنت في فلسطين والعالم العربي.',
}

export default async function LandingPage() {
  const plansResult = await getSubscriptionPlans()
  const plans = plansResult.ok ? plansResult.plans : []
  const trialPlan = plans.find((p) => p.billing_cycle === 'trial')

  return (
    <div className="min-h-screen bg-white text-[#0D1F1A]">
      <Navbar />
      <main>
        <HeroSection trialDays={trialPlan?.trial_days ?? null} />
        <FeaturesSection />
        <HowItWorks />
        <DashboardPreview />
        <PricingSection plans={plans} />
        <TestimonialsSection />
        <FAQSection trialDays={trialPlan?.trial_days ?? null} />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  )
}
