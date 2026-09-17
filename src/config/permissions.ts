export const OPERATIONAL_PERMISSION_KEYS = [
  'pos.use',
  'kds.use',
  'cashier.use',
  'delivery.use',
  'production.use',
  'checklists.use',
  'temperatures.use',
  'whatsapp.use',
  'employee.self',
  'timeclock.report',
] as const;

export type OperationalPermissionKey = (typeof OPERATIONAL_PERMISSION_KEYS)[number];

/**
 * Navigation is not authority. Routes resolve to canonical IAM capabilities
 * for operational surfaces. Management pages are intentionally absent: their
 * authority comes from StoreMembership, not Employee Role.
 */
export const OPERATIONAL_ROUTE_PERMISSIONS: Readonly<Record<string, OperationalPermissionKey>> = {
  '/pos': 'pos.use',
  '/kds': 'kds.use',
  '/ifood-kds': 'kds.use',
  '/cashier': 'cashier.use',
  '/delivery': 'delivery.use',
  '/mise-en-place': 'production.use',
  '/portioning': 'production.use',
  '/checklists': 'checklists.use',
  '/temperatures': 'temperatures.use',
  '/whatsapp-chats': 'whatsapp.use',
  '/my-rh': 'employee.self',
  '/time-clock': 'employee.self',
  '/my-leave': 'employee.self',
  '/my-profile': 'employee.self',
};

export function operationalPermissionForRoute(url: string): OperationalPermissionKey | null {
  const path = ('/' + (url || '').split('?')[0].split('#')[0].split('/').filter(Boolean)[0]).replace('/undefined', '/');
  return OPERATIONAL_ROUTE_PERMISSIONS[path] || null;
}

/**
 * Legacy route-shaped keys retained only while the remaining portal route
 * guards are migrated. Do not persist these values into role_permissions.
 */
export const LEGACY_ROUTE_PERMISSION_KEYS = [
  '/dashboard',
  '/home',
  '/pos',
  '/kds',
  '/ifood-kds',
  '/cashier',
  '/inventory',
  '/requisitions',
  '/purchasing',
  '/suppliers',
  '/customers',
  '/menu',
  '/menu-builder',
  '/ifood-menu',
  '/ifood-store-manager',
  '/technical-sheets',
  '/mise-en-place',
  '/performance',
  '/reports',
  '/employees',
  '/schedules',
  '/my-leave',
  '/my-profile',
  '/payroll',
  '/settings',
  '/reservations',
  '/time-clock',
  '/leave-management',
  '/tutorials',
  '/delivery',
  '/checklists',
  '/temperatures',
  '/whatsapp-chats',
] as const;

/** @deprecated Use OPERATIONAL_PERMISSION_KEYS for Role authority. */
export const ALL_PERMISSION_KEYS = [...LEGACY_ROUTE_PERMISSION_KEYS];
