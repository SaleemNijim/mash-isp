import Link from 'next/link'
import { HeroIllustration } from './HeroIllustration'
import { TrustStrip } from './TrustStrip'

export function HeroSection() {
  return (
    <section className="bg-mash-page py-16 md:py-24" dir="rtl">
      <div className="max-w-6xl mx-auto px-8">
        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-12 lg:gap-16 items-center">
          {/* نص — يمين في RTL */}
          <div className="order-1 lg:order-1">
            <span className="inline-flex items-center gap-2 bg-primary-50 text-primary-800 text-xs font-medium px-4 py-1.5 rounded-full mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-400" aria-hidden />
              نظام إدارة شركات الإنترنت الأول عربياً
            </span>

            <h1 className="text-[2rem] md:text-[2.75rem] font-medium leading-[1.3] text-mash-text mb-5">
              أدِر شركة الإنترنت
              <br />
              <span className="text-primary-600">من مكان واحد</span>
            </h1>

            <p className="text-base text-mash-text-secondary leading-[1.7] max-w-[440px] mb-8">
              منصة SaaS متكاملة تجمع إدارة المشتركين، بطاقات الإنترنت، مراقبة
              الشبكة، المستودع، والتقارير — كل شيء في مكان واحد.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 mb-3">
              <Link href="/register" className="mash-btn-primary text-center">
                ابدأ مجاناً 30 يوم
              </Link>
              <Link href="/features" className="mash-btn-secondary text-center">
                تعرّف على المميزات
              </Link>
            </div>

            <p className="text-xs text-mash-text-muted">
              لا بطاقة ائتمان · وصول كامل خلال فترة التجربة
            </p>

            <TrustStrip />
          </div>

          {/* illustration — يسار */}
          <div className="order-2 lg:order-2 flex justify-center lg:justify-start">
            <HeroIllustration />
          </div>
        </div>
      </div>
    </section>
  )
}
