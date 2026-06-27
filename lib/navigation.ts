export const ROUTES = {
  home: '/',
  features: '/features',
  pricing: '/pricing',
  contact: '/contact',
  login: '/login',
  register: '/register',
  verifyEmail: '/verify-email',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
  dashboard: '/dashboard',
  sales: '/sales',
  customers: '/customers',
  subscriptions: '/subscriptions',
  distributors: '/distributors',
  debts: '/debts',
  cardInventory: '/card-inventory',
  cardBatches: '/card-batches',
  cardProducts: '/card-products',
  cardSales: '/card-sales',
  warehouse: '/warehouse',
  networkRouters: '/network/routers',
  networkPorts: '/network/ports',
  payments: '/payments',
  pendingTasks: '/pending-tasks',
  reports: '/reports',
  auditLog: '/audit-log',
  recycleBin: '/recycle-bin',
  settings: '/settings',
  credentials: '/credentials',
  bankAccounts: '/bank-accounts',
  permissions: '/permissions',
  messages: '/messages',
  suspended: '/suspended',
  subscriptionExpired: '/subscription-expired',
  superAdminTenants: '/super-admin/tenants',
  superAdminPlans: '/super-admin/plans',
  superAdminInvoices: '/super-admin/invoices',
  superAdminMessages: '/super-admin/messages',
} as const

/** مسارات يُفحص فيها proxy صلاحيات الكاشير (انظر ROUTE_REQUIRED_PERMISSIONS) */
export const EMPLOYEE_ROUTE_PREFIXES = [
  '/sales',
  '/subscriptions',
  '/customers',
  '/network',
  '/distributors',
  '/debts',
  '/messages',
  '/card-inventory',
  '/card-products',
  '/card-batches',
  '/card-sales',
  '/credentials',
  '/bank-accounts',
  '/warehouse',
  '/pending-tasks',
  '/payments',
] as const

export type DashboardNavIcon =
  | 'LayoutDashboard'
  | 'ShoppingCart'
  | 'Users'
  | 'Wifi'
  | 'CreditCard'
  | 'Package'
  | 'Network'
  | 'DollarSign'
  | 'ClipboardList'
  | 'FileText'
  | 'FileSpreadsheet'
  | 'Settings'
  | 'KeyRound'
  | 'Landmark'
  | 'Truck'
  | 'Mail'
  | 'SlidersHorizontal'
  | 'Trash2'
  | 'ScrollText'

export type DashboardNavItem = {
  href: string
  label: string
  icon: DashboardNavIcon
  available: boolean
  pendingBadge?: boolean
  adminOnly?: boolean
  superAdminAllowed?: boolean
  /** إن وُجد — يُعرض للكاشير فقط عند امتلاك الصلاحية */
  permission?: string
}

export const CASHIER_NAV: DashboardNavItem[] = [
  // ── تشغيل يومي ──
  { href: ROUTES.sales, label: 'المبيعات', icon: 'ShoppingCart', available: true },
  {
    href: ROUTES.customers,
    label: 'المشتركون',
    icon: 'Users',
    available: true,
    permission: 'manage_customers',
  },
  {
    href: ROUTES.customers,
    label: 'المشتركون',
    icon: 'Users',
    available: true,
    permission: 'renew_subscriptions',
  },
  {
    href: ROUTES.customers,
    label: 'المشتركون',
    icon: 'Users',
    available: true,
    permission: 'create_subscriptions',
  },
  {
    href: ROUTES.pendingTasks,
    label: 'المهام المعلقة',
    icon: 'ClipboardList',
    available: true,
    pendingBadge: true,
    permission: 'view_pending_tasks',
  },
  {
    href: ROUTES.pendingTasks,
    label: 'المهام المعلقة',
    icon: 'ClipboardList',
    available: true,
    pendingBadge: true,
    permission: 'confirm_payments',
  },
  { href: ROUTES.debts, label: 'سجل الدائنين', icon: 'DollarSign', available: true },
  // ── بطاقات ──
  {
    href: ROUTES.cardInventory,
    label: 'مخزون البطاقات',
    icon: 'CreditCard',
    available: true,
    permission: 'manage_card_inventory',
  },
  {
    href: ROUTES.distributors,
    label: 'الموزعون',
    icon: 'Truck',
    available: true,
    permission: 'sell_cards',
  },
  {
    href: ROUTES.distributors,
    label: 'الموزعون',
    icon: 'Truck',
    available: true,
    permission: 'manage_distributors',
  },
  // ── بنية تقنية ──
  {
    href: ROUTES.credentials,
    label: 'PPP',
    icon: 'KeyRound',
    available: true,
    permission: 'manage_ppp',
  },
  {
    href: ROUTES.networkRouters,
    label: 'الشبكة',
    icon: 'Network',
    available: true,
    permission: 'manage_network',
  },
  // ── مالية ومخزون ──
  {
    href: ROUTES.bankAccounts,
    label: 'الحسابات البنكية',
    icon: 'Landmark',
    available: true,
    permission: 'manage_bank_accounts',
  },
  {
    href: ROUTES.warehouse,
    label: 'المستودع',
    icon: 'Package',
    available: true,
    permission: 'manage_warehouse',
  },
]

export const DASHBOARD_NAV: DashboardNavItem[] = [
  // ── تشغيل يومي ──
  { href: ROUTES.dashboard, label: 'الرئيسية', icon: 'LayoutDashboard', available: true },
  { href: ROUTES.sales, label: 'المبيعات', icon: 'ShoppingCart', available: true },
  { href: ROUTES.customers, label: 'المشتركون', icon: 'Users', available: true },
  {
    href: ROUTES.pendingTasks,
    label: 'المهام المعلقة',
    icon: 'ClipboardList',
    available: true,
    pendingBadge: true,
  },
  { href: ROUTES.debts, label: 'سجل الدائنين', icon: 'DollarSign', available: true },
  // ── بطاقات ──
  {
    href: ROUTES.cardInventory,
    label: 'مخزون البطاقات',
    icon: 'CreditCard',
    available: true,
    permission: 'manage_card_inventory',
  },
  { href: ROUTES.distributors, label: 'الموزعون', icon: 'Truck', available: true },
  // ── بنية تقنية ──
  { href: ROUTES.credentials, label: 'PPP', icon: 'KeyRound', available: true },
  { href: ROUTES.networkRouters, label: 'الشبكة', icon: 'Network', available: true },
  // ── مالية ومخزون ──
  { href: ROUTES.bankAccounts, label: 'الحسابات البنكية', icon: 'Landmark', available: true },
  { href: ROUTES.warehouse, label: 'المستودع', icon: 'Package', available: true },
  // ── تحليل ──
  { href: ROUTES.reports, label: 'التقارير', icon: 'FileText', available: true, adminOnly: true },
  { href: ROUTES.auditLog, label: 'سجل العمليات', icon: 'ScrollText', available: true, adminOnly: true },
  // ── إدارة ──
  {
    href: ROUTES.recycleBin,
    label: 'سلة المحذوفات',
    icon: 'Trash2',
    available: true,
    adminOnly: true,
    superAdminAllowed: true,
  },
  {
    href: ROUTES.settings,
    label: 'الإعدادات',
    icon: 'SlidersHorizontal',
    available: true,
    adminOnly: true,
  },
  {
    href: ROUTES.permissions,
    label: 'الصلاحيات',
    icon: 'Settings',
    available: true,
    adminOnly: true,
  },
]

export function isDashboardNavActive(pathname: string, href: string): boolean {
  if (pathname === href) return true
  if (href === ROUTES.dashboard) return false
  if (href === ROUTES.customers) {
    return (
      pathname.startsWith('/customers') ||
      pathname.startsWith('/subscriptions')
    )
  }
  if (href === ROUTES.networkRouters) return pathname.startsWith('/network')
  if (href === ROUTES.distributors) return pathname.startsWith('/distributors')
  if (href === ROUTES.cardInventory) {
    return (
      pathname.startsWith('/card-inventory') ||
      pathname.startsWith('/card-products') ||
      pathname.startsWith('/card-batches')
    )
  }
  return pathname.startsWith(href + '/')
}

export function getNavForRole(
  role: string | null,
  hasPermission: (code: string) => boolean,
): DashboardNavItem[] {
  if (role === 'employee') {
    const seen = new Set<string>()
    return CASHIER_NAV.filter((item) => {
      if (item.permission && !hasPermission(item.permission)) return false
      if (seen.has(item.href)) return false
      seen.add(item.href)
      return true
    })
  }
  if (role === 'admin' || role === 'super_admin') {
    return DASHBOARD_NAV.filter(
      (item) =>
        !item.adminOnly ||
        role === 'admin' ||
        (role === 'super_admin' && item.superAdminAllowed),
    )
  }
  return DASHBOARD_NAV
}
