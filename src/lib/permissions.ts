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
  agent: ['dashboard:view', 'tickets:list', 'tickets:create', 'tickets:assign', 'tickets:export', 'tickets:import'],
  dm_officer: ['tickets:work'],
};

export function hasPermission(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function homePathFor(role: Role | null | undefined): string {
  return role === 'dm_officer' ? '/my-tickets' : '/dashboard';
}
