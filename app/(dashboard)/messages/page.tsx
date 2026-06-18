'use client'

import { MessagesPageClient } from '@/components/messages/MessagesPageClient'
import { usePermissions } from '@/hooks/usePermissions'

export default function MessagesPage() {
  const role = usePermissions((s) => s.role)
  const loading = usePermissions((s) => s.loading)

  if (loading) {
    return (
      <div dir="rtl" className="flex items-center justify-center py-24 text-sm text-mash-text-muted">
        جارٍ التحميل...
      </div>
    )
  }

  if (!role || role === 'super_admin') {
    return null
  }

  return <MessagesPageClient role={role as 'admin' | 'employee'} />
}
