import Link from 'next/link'

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-mash-page" dir="rtl">
      <PublicHeader />
      <main className="flex-1">{children}</main>
      <PublicFooter />
    </div>
  )
}

function PublicHeader() {
  return (
    <header className="sticky top-0 z-50 bg-mash-surface border-b border-mash-border">
      <div className="max-w-6xl mx-auto px-8 h-16 flex items-center justify-between gap-4">
        <Link
          href="/"
          className="text-lg font-medium text-mash-text tracking-tight shrink-0"
        >
          MASH ISP
        </Link>

        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-mash-text-secondary">
          <Link href="/features" className="hover:text-primary-600 transition-colors min-h-11 inline-flex items-center">
            المميزات
          </Link>
          <Link href="/pricing" className="hover:text-primary-600 transition-colors min-h-11 inline-flex items-center">
            الأسعار
          </Link>
          <Link href="/contact" className="hover:text-primary-600 transition-colors min-h-11 inline-flex items-center">
            تواصل معنا
          </Link>
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/login"
            className="hidden sm:inline-flex items-center min-h-11 px-4 text-sm font-medium text-mash-text-secondary hover:text-mash-text transition-colors"
          >
            تسجيل دخول
          </Link>
          <Link href="/register" className="mash-btn-primary text-sm px-4">
            ابدأ مجاناً
          </Link>
        </div>
      </div>
    </header>
  )
}

function PublicFooter() {
  return (
    <footer className="bg-mash-surface border-t border-mash-border" dir="rtl">
      <div className="max-w-6xl mx-auto px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <span className="text-lg font-medium text-mash-text">MASH ISP</span>
            <p className="mt-3 text-sm text-mash-text-muted leading-relaxed">
              نظام إدارة شركات الإنترنت — SaaS متكامل لإدارة المشتركين،
              البطاقات، الشبكة، والتقارير.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-medium text-mash-text mb-4">الصفحات</h3>
            <ul className="space-y-2 text-sm text-mash-text-secondary">
              <li>
                <Link href="/features" className="hover:text-primary-600 transition-colors">
                  المميزات
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="hover:text-primary-600 transition-colors">
                  الأسعار
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-primary-600 transition-colors">
                  تواصل معنا
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-medium text-mash-text mb-4">الحساب</h3>
            <ul className="space-y-2 text-sm text-mash-text-secondary">
              <li>
                <Link href="/register" className="hover:text-primary-600 transition-colors">
                  إنشاء حساب
                </Link>
              </li>
              <li>
                <Link href="/login" className="hover:text-primary-600 transition-colors">
                  تسجيل دخول
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-mash-border flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-mash-text-muted">
          <p>© {new Date().getFullYear()} MASH ISP — جميع الحقوق محفوظة.</p>
          <p>مُصمَّم للشركات العربية في قطاع الإنترنت</p>
        </div>
      </div>
    </footer>
  )
}
