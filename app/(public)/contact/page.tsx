import type { Metadata } from 'next'
import Link from 'next/link'
import { MessageCircle, Mail } from 'lucide-react'
import { ContactForm } from '@/components/public/ContactForm'

export const metadata: Metadata = {
  title: 'تواصل معنا',
  description: 'تواصل مع فريق MASH ISP عبر النموذج أو واتساب أو البريد الإلكتروني.',
}

const WHATSAPP_NUMBER = '970591000000'
const SUPPORT_EMAIL = 'info@mashisp.com'

export default function ContactPage() {
  return (
    <div className="bg-mash-page">
      <section className="bg-mash-page py-16 lg:py-20 border-b border-mash-border">
        <div className="max-w-6xl mx-auto px-8 text-center">
          <h1 className="text-3xl sm:text-4xl font-medium text-mash-text mb-4">
            تواصل معنا
          </h1>
          <p className="text-base text-mash-text-secondary max-w-xl mx-auto">
            فريق الدعم متاح للإجابة على أسئلتك ومساعدتك في البدء.
          </p>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-8 pb-20 pt-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-12">
          <div className="bg-mash-surface border border-mash-border rounded-xl p-8">
            <h2 className="text-lg font-medium text-mash-text mb-6">أرسل رسالة</h2>
            <ContactForm />
          </div>

          <div className="space-y-4">
            <div className="bg-mash-surface border border-mash-border rounded-xl p-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center shrink-0">
                  <MessageCircle className="w-5 h-5 text-primary-600" strokeWidth={1.5} />
                </div>
                <div>
                  <h3 className="font-medium text-mash-text mb-1">واتساب</h3>
                  <p className="text-sm text-mash-text-muted mb-3">
                    الطريقة الأسرع للتواصل — نرد في دقائق خلال أوقات العمل.
                  </p>
                  <a
                    href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
                      'مرحباً، أريد الاستفسار عن MASH ISP'
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mash-btn-primary text-sm"
                  >
                    ابدأ محادثة
                  </a>
                </div>
              </div>
            </div>

            <div className="bg-mash-surface border border-mash-border rounded-xl p-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center shrink-0">
                  <Mail className="w-5 h-5 text-primary-600" strokeWidth={1.5} />
                </div>
                <div>
                  <h3 className="font-medium text-mash-text mb-1">البريد الإلكتروني</h3>
                  <p className="text-sm text-mash-text-muted mb-3">
                    للاستفسارات التفصيلية أو الدعم الفني — نرد خلال 24 ساعة.
                  </p>
                  <a
                    href={`mailto:${SUPPORT_EMAIL}`}
                    className="text-primary-600 font-medium text-sm hover:underline underline-offset-2"
                    dir="ltr"
                  >
                    {SUPPORT_EMAIL}
                  </a>
                </div>
              </div>
            </div>

            <div className="bg-mash-surface border border-mash-border rounded-xl p-6">
              <h3 className="font-medium text-mash-text mb-2">جاهز للبدء؟</h3>
              <p className="text-mash-text-secondary text-sm mb-4">
                سجِّل الآن وابدأ تجربتك المجانية دون الحاجة للتحدث معنا.
              </p>
              <Link href="/register" className="mash-btn-primary text-sm">
                ابدأ مجاناً
              </Link>
            </div>

            <div className="text-sm text-mash-text-muted bg-mash-page rounded-xl px-5 py-4 border border-mash-border">
              <p className="font-medium text-mash-text-secondary mb-1">أوقات الدعم</p>
              <p>الأحد – الخميس · ٩ صباحاً – ٦ مساءً (GMT+3)</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
