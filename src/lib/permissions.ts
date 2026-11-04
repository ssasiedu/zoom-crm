import type { Role } from '@/types';

export type Permission =
  | 'dashboard:view'
  | 'tickets:list'
  | 'tickets:viewAll'
  | 'tickets:create'
  | 'tickets:assign'
  | 'tickets:work'
  | 'tickets:close'
  | 'tickets:reopen'
  | 'tickets:editCore'
  | 'tickets:editDateOpened'
  | 'tickets:delete'
  | 'tickets:export'
  | 'tickets:import'
  | 'reports:view'
  | 'sms:send'
  | 'debtors:view'
  | 'debtors:manage'
  | 'debtors:work'
  /** send a ticket down to the District Operation Officer for that district */
  | 'tickets:forward'
  /** do the field work on a ticket forwarded to you */
  | 'tickets:field'
  /** load district officers and regional managers */
  | 'officers:manage'
  | 'admin';

const ALL: Permission[] = [
  'dashboard:view',
  'tickets:list',
  'tickets:viewAll',
  'tickets:create',
  'tickets:assign',
  'tickets:work',
  'tickets:close',
  'tickets:reopen',
  'tickets:editCore',
  'tickets:editDateOpened',
  'tickets:delete',
  'tickets:export',
  'tickets:import',
  'reports:view',
  'sms:send',
  'debtors:view',
  'debtors:manage',
  'debtors:work',
  'tickets:forward',
  'tickets:field',
  'officers:manage',
  'admin',
];

const SUPERVISOR_EXCLUDED: Permission[] = ['admin', 'tickets:editDateOpened', 'tickets:delete'];

/**
 * UI permission matrix. The database enforces the same rules with RLS and
 * triggers; this only decides what to show.
 */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: ALL,
  supervisor: ALL.filter((p) => !SUPERVISOR_EXCLUDED.includes(p)),
  agent: [
    'dashboard:view',
    'tickets:list',
    'tickets:create',
    'tickets:assign',
    'tickets:export',
    'tickets:import',
    'tickets:forward',
    'sms:send',
  ],
  dm_officer: ['tickets:work', 'tickets:forward', 'sms:send', 'debtors:work'],
  /**
   * The field layer. Both see only forwarded tickets — the database
   * decides that, not this list. A regional manager can forward within
   * their region and read the reports for it; a district officer only
   * works the tickets they have been given.
   */
  regional_manager: ['tickets:list', 'tickets:work', 'tickets:forward', 'reports:view', 'sms:send', 'tickets:export'],
  district_officer: ['tickets:field', 'sms:send'],
};

export function hasPermission(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function homePathFor(role: Role | null | undefined): string {
  if (role === 'district_officer') return '/field-work';
  if (role === 'dm_officer') return '/my-tickets';
  if (role === 'regional_manager') return '/forwarded';
  return '/dashboard';
}
