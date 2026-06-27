import Link from 'next/link'
import { Clock } from 'lucide-react'
import { AuthShell } from '@/components/shared/AuthShell'
import { Button } from '@/components/ui/button'

export default function SubscriptionExpiredPage() {
  return (
    <AuthShell>
      <div className="text-center">
        <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-[#FAEEDA]">
          <Clock className="size-7 text-[#633806]" strokeWidth={1.75} />
        </div>
        <h1 className="mb-2 text-2xl font-bold text-[#0D1F1A]">انتهت صلاحية اشتراكك</h1>
        <p className="mb-8 text-sm leading-relaxed text-[#4A6B60]">
          لقد انتهت فترة الاشتراك أو التجربة المجانية. لمواصلة استخدام النظام بكامل
          مميزاته، يرجى تجديد اشتراكك باختيار إحدى الخطط المتاحة.
        </p>

        <Button asChild className="mash-btn-primary w-full">
          <Link href="/pricing">عرض خطط الاشتراك</Link>
        </Button>

        <p className="mt-5 text-center text-sm text-[#4A6B60]">
          تعتقد أن هذا خطأ؟{' '}
          <Link href="/contact" className="font-bold text-[#0F6E56] hover:underline">
            تواصل معنا
          </Link>
        </p>
      </div>
    </AuthShell>
  )
}
