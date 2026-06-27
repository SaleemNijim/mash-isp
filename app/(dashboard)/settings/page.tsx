'use client'

import { usePermissions } from '@/hooks/usePermissions'
import { CompanyProfileSection } from '@/components/settings/CompanyProfileSection'
import { AdminAccountSection } from '@/components/settings/AdminAccountSection'
import { GoogleDriveSyncSection } from '@/components/settings/GoogleDriveSyncSection'
import { DataPanel } from '@/components/shared/DataPanel'
import { PageHeader } from '@/components/shared/PageHeader'
import Link from 'next/link'
import { Landmark, KeyRound, Users, ChevronLeft } from 'lucide-react'
import { ROUTES } from '@/lib/navigation'

const QUICK_LINKS = [
  { href: ROUTES.bankAccounts, label: 'الحسابات البنكية', icon: Landmark },
  { href: ROUTES.permissions, label: 'الصلاحيات والموظفون', icon: Users },
  { href: ROUTES.credentials, label: 'PPP', icon: KeyRound },
]

export default function SettingsPage() {
  const role = usePermissions((s) => s.role)

  if (role !== 'admin') {
    return (
      <div dir="rtl" className="py-16 text-center text-muted-foreground">
        <p className="text-lg font-medium">الإعدادات</p>
        <p className="text-sm mt-2">متاحة لمسؤول الشركة فقط.</p>
      </div>
    )
  }

  return (
    <div dir="rtl" className="w-full space-y-6">
      <PageHeader
        title="الإعدادات"
        description="بيانات الشركة، حساب المسؤول، البريد وكلمة المرور، والمزامنة"
      />

      <div className="grid gap-6 xl:grid-cols-2 items-start">
        <CompanyProfileSection />
        <AdminAccountSection />
        <GoogleDriveSyncSection />
      </div>

      <DataPanel className="p-5">
        <h2 className="font-semibold mb-3">اختصارات</h2>
        <div className="grid gap-0 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x sm:divide-x-reverse divide-border">
          {QUICK_LINKS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center justify-between gap-3 py-3 sm:px-4 first:sm:pr-0 hover:text-primary transition-colors"
            >
              <span className="flex items-center gap-2 text-sm">
                <Icon size={16} className="text-muted-foreground" />
                {label}
              </span>
              <ChevronLeft size={16} className="text-muted-foreground" />
            </Link>
          ))}
        </div>
      </DataPanel>
    </div>
  )
}
