export const ROUTES = {
  home: '/',
  features: '/features',
  pricing: '/pricing',
  contact: '/contact',
  login: '/login',
  register: '/register',
  verifyEmail: '/verify-email',
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
  excelViewer: '/excel-viewer',
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

/** مسارات مسموحة للكاشير (employee) — الباقي يُحجب في proxy */
export const EMPLOYEE_ALLOWED_PREFIXES = [
  '/sales',
  '/subscriptions',
  '/customers',
  '/network',
  '/distributors',
  '/debts',
  '/messages',
  '/card-inventory',
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

export type DashboardNavItem = {
  href: string
  label: string
  icon: DashboardNavIcon
  available: boolean
  pendingBadge?: boolean
  adminOnly?: boolean
  /** إن وُجد — يُعرض للكاشير فقط عند امتلاك الصلاحية */
  permission?: string
}

export const CASHIER_NAV: DashboardNavItem[] = [
  { href: ROUTES.sales, label: 'المبيعات', icon: 'ShoppingCart', available: true },
  {
    href: ROUTES.customers,
    label: 'المشتركون',
    icon: 'Users',
    available: true,
    permission: 'renew_subscriptions',
  },
  {
    href: ROUTES.distributors,
    label: 'الموزعون',
    icon: 'Truck',
    available: true,
    permission: 'sell_cards',
  },
  { href: ROUTES.debts, label: 'سجل الدائنين', icon: 'DollarSign', available: true },
  {
    href: ROUTES.cardInventory,
    label: 'مخزون البطاقات',
    icon: 'CreditCard',
    available: true,
    permission: 'manage_card_inventory',
  },
  {
    href: ROUTES.networkRouters,
    label: 'الشبكة',
    icon: 'Network',
    available: true,
    permission: 'manage_network',
  },
]

export const DASHBOARD_NAV: DashboardNavItem[] = [
  { href: ROUTES.dashboard, label: 'الرئيسية', icon: 'LayoutDashboard', available: true },
  { href: ROUTES.sales, label: 'المبيعات', icon: 'ShoppingCart', available: true },
  { href: ROUTES.customers, label: 'المشتركون', icon: 'Users', available: true },
  { href: ROUTES.distributors, label: 'الموزعون', icon: 'Truck', available: true },
  { href: ROUTES.debts, label: 'سجل الدائنين', icon: 'DollarSign', available: true },
  { href: ROUTES.credentials, label: 'كريدنشال', icon: 'KeyRound', available: true },
  {
    href: ROUTES.cardInventory,
    label: 'مخزون البطاقات',
    icon: 'CreditCard',
    available: true,
    permission: 'manage_card_inventory',
  },
  { href: ROUTES.bankAccounts, label: 'الحسابات البنكية', icon: 'Landmark', available: true },
  { href: ROUTES.warehouse, label: 'المستودع', icon: 'Package', available: true },
  { href: ROUTES.networkRouters, label: 'الشبكة', icon: 'Network', available: true },
  {
    href: ROUTES.pendingTasks,
    label: 'المهام المعلقة',
    icon: 'ClipboardList',
    available: true,
    pendingBadge: true,
  },
  { href: ROUTES.reports, label: 'التقارير', icon: 'FileText', available: false },
  { href: ROUTES.excelViewer, label: 'استيراد Excel', icon: 'FileSpreadsheet', available: true },
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
    return CASHIER_NAV.filter(
      (item) => !item.permission || hasPermission(item.permission),
    )
  }
  if (role === 'admin' || role === 'super_admin') {
    return DASHBOARD_NAV.filter((item) => !item.adminOnly || role === 'admin')
  }
  return DASHBOARD_NAV
}

export function isEmployeeRouteAllowed(pathname: string): boolean {
  return EMPLOYEE_ALLOWED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + '/'),
  )
}
