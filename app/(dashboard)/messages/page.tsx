'use client'

import { MessagesPageClient } from '@/components/messages/MessagesPageClient'
import { usePermissions } from '@/hooks/usePermissions'

export default function MessagesPage() {
  const role = usePermissions((s) => s.role)

  if (!role || role === 'super_admin') {
    return null
  }

  return <MessagesPageClient role={role as 'admin' | 'employee'} />
}
