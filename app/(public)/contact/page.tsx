import type { Metadata } from 'next'
import Link from 'next/link'
import { MessageCircle, Mail } from 'lucide-react'
import { PublicPageHero } from '@/components/shared/PublicPageHero'
import { ContactForm } from '@/components/public/ContactForm'

export const metadata: Metadata = {
  title: 'تواصل معنا',
  description: 'تواصل مع فريق MASH ISP عبر النموذج أو واتساب أو البريد الإلكتروني.',
}

const WHATSAPP_NUMBER = '970591000000'
const SUPPORT_EMAIL = 'info@mashisp.com'

export default function ContactPage() {
  return (
    <div className="bg-white">
      <PublicPageHero
        eyebrow="الدعم"
        title="تواصل معنا"
        description="فريق الدعم متاح للإجابة على أسئلتك ومساعدتك في البدء."
      />

      <section className="landing-section pt-12">
        <div className="landing-container">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12">
            <div className="landing-card">
              <h2 className="mb-6 text-lg font-bold text-[#0D1F1A]">أرسل رسالة</h2>
              <ContactForm />
            </div>

            <div className="space-y-4">
              <div className="landing-card !p-6">
                <div className="flex items-start gap-4">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#E8F5F1]">
                    <MessageCircle className="size-5 text-[#0F6E56]" strokeWidth={1.75} />
                  </div>
                  <div>
                    <h3 className="mb-1 font-bold text-[#0D1F1A]">واتساب</h3>
                    <p className="mb-3 text-sm text-[#4A6B60]">
                      الطريقة الأسرع للتواصل — نرد في دقائق خلال أوقات العمل.
                    </p>
                    <a
                      href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
                        'مرحباً، أريد الاستفسار عن MASH ISP'
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="landing-btn-primary text-sm"
                    >
                      ابدأ محادثة
                    </a>
                  </div>
                </div>
              </div>

              <div className="landing-card !p-6">
                <div className="flex items-start gap-4">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#E8F5F1]">
                    <Mail className="size-5 text-[#0F6E56]" strokeWidth={1.75} />
                  </div>
                  <div>
                    <h3 className="mb-1 font-bold text-[#0D1F1A]">البريد الإلكتروني</h3>
                    <p className="mb-3 text-sm text-[#4A6B60]">
                      للاستفسارات التفصيلية أو الدعم الفني — نرد خلال 24 ساعة.
                    </p>
                    <a
                      href={`mailto:${SUPPORT_EMAIL}`}
                      className="text-sm font-bold text-[#0F6E56] hover:underline"
                      dir="ltr"
                    >
                      {SUPPORT_EMAIL}
                    </a>
                  </div>
                </div>
              </div>

              <div className="landing-card !p-6">
                <h3 className="mb-2 font-bold text-[#0D1F1A]">جاهز للبدء؟</h3>
                <p className="mb-4 text-sm text-[#4A6B60]">
                  سجّل الآن وابدأ تجربتك المجانية دون الحاجة للتحدث معنا.
                </p>
                <Link href="/register" className="landing-btn-primary text-sm">
                  ابدأ مجاناً
                </Link>
              </div>

              <div className="rounded-2xl border border-[#D1E8E2] bg-[#F8FFFE] px-5 py-4 text-sm text-[#4A6B60]">
                <p className="mb-1 font-bold text-[#0D1F1A]">أوقات الدعم</p>
                <p>الأحد – الخميس · ٩ صباحاً – ٦ مساءً (GMT+3)</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
