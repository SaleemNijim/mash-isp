import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function SubscriptionExpiredPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4" dir="rtl">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="text-5xl mb-4">⏰</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            انتهت صلاحية اشتراكك
          </h1>
          <p className="text-gray-500 text-sm leading-relaxed mb-8">
            لقد انتهت فترة الاشتراك أو التجربة المجانية. لمواصلة استخدام النظام
            بكامل مميزاته، يرجى تجديد اشتراكك باختيار إحدى الخطط المتاحة.
          </p>

          <Button asChild className="w-full">
            <Link href="/pricing">عرض خطط الاشتراك</Link>
          </Button>

          <p className="text-center text-sm text-gray-400 mt-5">
            تعتقد أن هذا خطأ؟{' '}
            <Link href="/contact" className="text-blue-600 hover:underline">
              تواصل معنا
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
