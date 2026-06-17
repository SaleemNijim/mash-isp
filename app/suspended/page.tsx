import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function SuspendedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4" dir="rtl">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="text-5xl mb-4">🚫</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            تم تعليق حسابك
          </h1>
          <p className="text-gray-500 text-sm leading-relaxed mb-8">
            حسابك غير نشط حالياً. يرجى التواصل مع مدير النظام في شركتك
            لإعادة تفعيل الوصول.
          </p>

          <Button asChild variant="outline" className="w-full">
            <Link href="/login">العودة لتسجيل الدخول</Link>
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
