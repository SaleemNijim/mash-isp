import { Navbar } from '@/components/landing/Navbar'
import { Footer } from '@/components/landing/Footer'

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white text-[#0D1F1A]" dir="rtl">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  )
}
