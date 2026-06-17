/** 12 صلاحية من seed — المصدر الوحيد للحقيقة في الواجهة */
export const PERMISSION_CODES = [
  'view_full_password',
  'delete_records',
  'manage_users',
  'manage_permissions',
  'manage_bank_accounts',
  'renew_subscriptions',
  'sell_cards',
  'manage_network',
  'manage_warehouse',
  'import_excel',
  'view_reports',
  'confirm_payments',
] as const

export type PermissionCode = (typeof PERMISSION_CODES)[number]

export const PERMISSION_LABELS: Record<PermissionCode, string> = {
  view_full_password:   'عرض كلمة المرور كاملة',
  delete_records:       'حذف السجلات',
  manage_users:         'إدارة المستخدمين',
  manage_permissions:   'إدارة الصلاحيات',
  manage_bank_accounts: 'إدارة الحسابات البنكية',
  renew_subscriptions:  'تجديد الاشتراكات',
  sell_cards:           'بيع البطاقات',
  manage_network:       'إدارة الشبكة',
  manage_warehouse:     'إدارة المستودع',
  import_excel:         'استيراد Excel',
  view_reports:         'عرض التقارير',
  confirm_payments:     'تأكيد المدفوعات',
}

/** صلاحيات افتراضية للكاشier الجديد */
export const DEFAULT_CASHIER_PERMISSIONS: PermissionCode[] = [
  'renew_subscriptions',
  'sell_cards',
  'manage_network',
]
