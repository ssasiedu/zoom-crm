import {
  BarChart3,
  Bell,
  ClipboardList,
  HandCoins,
  Inbox,
  LayoutDashboard,
  MapPin,
  PhoneCall,
  PlusCircle,
  Send,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import type { Permission } from '@/lib/permissions';
import type { Role } from '@/types';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  permission?: Permission;
  /** show only to users linked to an officer record */
  officerOnly?: boolean;
  /** show only to these roles, whatever else matches */
  roles?: Role[];
  shortcut?: string;
  /** small heading rendered above this item in the sidebar */
  section?: string;
}

const DESK: Role[] = ['admin', 'supervisor', 'agent', 'dm_officer'];

export const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard:view' },
  { to: '/my-tickets', label: 'My Tickets', icon: Inbox, officerOnly: true, roles: DESK },
  { to: '/field-work', label: 'My Field Work', icon: MapPin, officerOnly: true, roles: ['district_officer'] },
  { to: '/tickets', label: 'All Tickets', icon: ClipboardList, permission: 'tickets:list' },
  { to: '/tickets/new', label: 'New Ticket', icon: PlusCircle, permission: 'tickets:create', shortcut: 'N' },
  { to: '/forwarded', label: 'Forwarded Work', icon: Send, permission: 'tickets:forward', roles: ['admin', 'supervisor', 'regional_manager'], section: 'Field layer' },
  { to: '/my-debtors', label: 'My Debtor List', icon: PhoneCall, officerOnly: true, roles: DESK, section: 'Debt recovery' },
  { to: '/debtors', label: 'Debtor Lists', icon: HandCoins, permission: 'debtors:view', section: 'Debt recovery' },
  { to: '/reports', label: 'Reports', icon: BarChart3, permission: 'reports:view', section: 'Insights' },
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/admin', label: 'Administration', icon: Settings, permission: 'admin' },
];

/** Whether this item belongs in the sidebar for the person signed in */
export function navVisible(
  item: NavItem,
  ctx: { role: Role | null | undefined; officerId: string | null | undefined; can: (p: Permission) => boolean },
): boolean {
  if (item.roles && (!ctx.role || !item.roles.includes(ctx.role))) return false;
  if (item.officerOnly) return Boolean(ctx.officerId) || ctx.role === 'dm_officer';
  return item.permission ? ctx.can(item.permission) : true;
}
