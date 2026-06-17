'use client'

import { usePermissions } from '@/hooks/usePermissions'

interface PermissionGuardProps {
  /** Permission code that must be present for children to render */
  permission: string
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
  children,
  fallback = null,
}: PermissionGuardProps) {
  const loading = usePermissions((s) => s.loading)
  const hasPermission = usePermissions((s) => s.hasPermission)

  if (loading) return null

  if (!hasPermission(permission)) {
    return <>{fallback}</>
  }

  return <>{children}</>
}
