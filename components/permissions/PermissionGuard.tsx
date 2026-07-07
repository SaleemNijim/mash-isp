'use client'

import { usePermissions } from '@/hooks/usePermissions'

interface PermissionGuardProps {
  /** Permission code that must be present for children to render */
  permission?: string
  /** أي صلاحية من القائمة تكفي — يُستخدم بدل `permission` عند التوفّر */
  anyOf?: string[]
  children: React.ReactNode
  /** Rendered when permission is absent — defaults to nothing */
  fallback?: React.ReactNode
}

/**
 * Hides children when the current user lacks `permission`.
 * Reads from the Zustand store populated by usePermissions.loadPermissions().
 */
export function PermissionGuard({
  permission,
  anyOf,
  children,
  fallback = null,
}: PermissionGuardProps) {
  const loading = usePermissions((s) => s.loading)
  const hasPermission = usePermissions((s) => s.hasPermission)

  if (loading) return null

  const allowed = anyOf?.length
    ? anyOf.some((code) => hasPermission(code))
    : permission
      ? hasPermission(permission)
      : true

  if (!allowed) {
    return <>{fallback}</>
  }

  return <>{children}</>
}
