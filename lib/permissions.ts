/** صلاحيات الكاشير — المصدر الوحيد للحقيقة في الواجهة */
export const PERMISSION_CODES = [
  // مشتركون واشتراكات
  'manage_customers',
  'create_subscriptions',
  'renew_subscriptions',
  // بطاقات ومبيعات
  'sell_cards',
  'manage_card_inventory',
  // PPP
  'manage_ppp',
  'view_full_password',
  'import_excel',
  // موزعون وديون
  'manage_distributors',
  'manage_debts',
  // شبكة ومستودع وحسابات
  'manage_network',
  'manage_warehouse',
  'manage_bank_accounts',
  // مهام وتقارير
  'view_pending_tasks',
  'confirm_payments',
  'view_reports',
  // إدارة النظام
  'manage_users',
  'manage_permissions',
  'delete_records',
] as const

export type PermissionCode = (typeof PERMISSION_CODES)[number]

export const PERMISSION_LABELS: Record<PermissionCode, string> = {
  manage_customers: 'إضافة وتعديل المشتركين',
  create_subscriptions: 'اشتراك PPP جديد',
  renew_subscriptions: 'تجديد الاشتراكات',
  sell_cards: 'بيع البطاقات',
  manage_card_inventory: 'إدارة مخزون البطاقات',
  manage_ppp: 'إدارة PPP',
  view_full_password: 'عرض كلمة المرور كاملة',
  import_excel: 'استيراد Excel',
  manage_distributors: 'إضافة واستيراد الموزعين',
  manage_debts: 'تسديد الديون',
  manage_network: 'إدارة الشبكة',
  manage_warehouse: 'إدارة المستودع',
  manage_bank_accounts: 'إدارة الحسابات البنكية',
  view_pending_tasks: 'عرض المهام المعلقة',
  confirm_payments: 'تأكيد المدفوعات',
  view_reports: 'عرض التقارير',
  manage_users: 'إدارة المستخدمين',
  manage_permissions: 'تعديل صلاحيات الآخرين',
  delete_records: 'حذف السجلات',
}

/** تجميع الصلاحيات في واجهة المصفوفة */
export const PERMISSION_GROUPS: {
  id: string
  label: string
  codes: PermissionCode[]
}[] = [
  {
    id: 'customers',
    label: 'المشتركون والاشتراكات',
    codes: ['manage_customers', 'create_subscriptions', 'renew_subscriptions'],
  },
  {
    id: 'cards',
    label: 'البطاقات والمبيعات',
    codes: ['sell_cards', 'manage_card_inventory'],
  },
  {
    id: 'ppp',
    label: 'PPP',
    codes: ['manage_ppp', 'view_full_password', 'import_excel'],
  },
  {
    id: 'distributors',
    label: 'الموزعون والديون',
    codes: ['manage_distributors', 'manage_debts'],
  },
  {
    id: 'ops',
    label: 'الشبكة والمستودع والحسابات',
    codes: ['manage_network', 'manage_warehouse', 'manage_bank_accounts'],
  },
  {
    id: 'tasks',
    label: 'المهام والتقارير',
    codes: ['view_pending_tasks', 'confirm_payments', 'view_reports'],
  },
  {
    id: 'admin',
    label: 'الإدارة والحذف',
    codes: ['manage_users', 'manage_permissions', 'delete_records'],
  },
]

/** صلاحيات افتراضية للكاشير الجديد — تشغيل يومي فقط؛ الشبكة والحذف يمنحها المدير */
export const DEFAULT_CASHIER_PERMISSIONS: PermissionCode[] = [
  'renew_subscriptions',
  'sell_cards',
]

/**
 * مسار → صلاحيات مقبولة (أي واحدة تكفي).
 * مصفوفة فارغة = مسموح لكل الكاشيرين.
 */
export const ROUTE_REQUIRED_PERMISSIONS: Record<string, PermissionCode[]> = {
  '/sales': [],
  '/messages': [],
  '/debts': [],
  '/customers': ['manage_customers', 'renew_subscriptions', 'create_subscriptions'],
  '/subscriptions': ['manage_customers', 'renew_subscriptions', 'create_subscriptions'],
  '/distributors': ['sell_cards', 'manage_distributors'],
  '/card-inventory': ['manage_card_inventory', 'sell_cards'],
  '/card-products': ['manage_card_inventory', 'sell_cards'],
  '/card-batches': ['manage_card_inventory', 'sell_cards'],
  '/card-sales': ['sell_cards'],
  '/network': ['manage_network'],
  '/credentials': ['manage_ppp'],
  '/bank-accounts': ['manage_bank_accounts'],
  '/warehouse': ['manage_warehouse'],
  '/pending-tasks': ['view_pending_tasks', 'confirm_payments'],
  '/payments': ['confirm_payments', 'view_pending_tasks'],
}

export function hasAnyPermission(
  userPermissions: string[],
  required: PermissionCode[],
): boolean {
  if (required.length === 0) return true
  return required.some((code) => userPermissions.includes(code))
}

export function isEmployeeRouteAllowed(
  pathname: string,
  userPermissions: string[],
): boolean {
  for (const [prefix, required] of Object.entries(ROUTE_REQUIRED_PERMISSIONS)) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) {
      return hasAnyPermission(userPermissions, required)
    }
  }
  return false
}
