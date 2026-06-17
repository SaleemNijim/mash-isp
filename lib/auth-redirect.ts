/**
 * مسار الدخول بعد تسجيل الدخول الناجح — حسب دور المستخدم.
 */
export function resolvePostLoginPath(role: string | null | undefined): string {
  switch (role) {
    case 'super_admin':
      return '/super-admin/tenants'
    case 'employee':
      return '/sales'
    default:
      return '/dashboard'
  }
}
