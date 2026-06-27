'use client'

import { PermissionGuard } from '@/components/permissions/PermissionGuard'
import { PppInventoryPage } from '@/components/ppp/PppInventoryPage'

export default function CredentialsPage() {
  return (
    <PermissionGuard
      permission="manage_ppp"
      fallback={
        <div dir="rtl" className="p-8 text-center text-muted-foreground">
          ليس لديك صلاحية إدارة PPP — اطلب من المدير منحك الصلاحية.
        </div>
      }
    >
      <PppInventoryPage />
    </PermissionGuard>
  )
}
