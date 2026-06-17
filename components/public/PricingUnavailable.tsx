import Link from 'next/link'
import { AlertCircle } from 'lucide-react'

interface PricingUnavailableProps {
  debugReason?: string
}

export function PricingUnavailable({ debugReason }: PricingUnavailableProps) {
  if (process.env.NODE_ENV === 'development' && debugReason) {
    console.warn('[PricingCards] تعذّر جلب الخطط:', debugReason)
  }

  return (
    <div
      className="rounded-xl border border-mash-border bg-mash-warning-bg px-6 py-8 text-center"
      dir="rtl"
    >
      <AlertCircle className="mx-auto mb-3 text-mash-warning-text" size={28} />
      <p className="font-medium text-mash-text">تعذّر تحميل الأسعار حالياً</p>
      <p className="mt-2 text-sm text-mash-text-secondary">
        يمكنك التسجيل للتجربة المجانية — الأسعار تُحدَّث من لوحة الإدارة.
      </p>
      <Link href="/register" className="mt-5 mash-btn-primary">
        ابدأ مجاناً
      </Link>
    </div>
  )
}
