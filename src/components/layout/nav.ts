import {
  BarChart3,
  Bell,
  ClipboardList,
  HandCoins,
  Inbox,
  LayoutDashboard,
  PhoneCall,
  PlusCircle,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import type { Permission } from '@/lib/permissions';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  permission?: Permission;
  /** show only to users linked to an officer record */
  officerOnly?: boolean;
  shortcut?: string;
  /** small heading rendered above this item in the sidebar */
  section?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard:view' },
  { to: '/my-tickets', label: 'My Tickets', icon: Inbox, officerOnly: true },
  { to: '/tickets', label: 'All Tickets', icon: ClipboardList, permission: 'tickets:list' },
  { to: '/tickets/new', label: 'New Ticket', icon: PlusCircle, permission: 'tickets:create', shortcut: 'N' },
  { to: '/my-debtors', label: 'My Debtor List', icon: PhoneCall, officerOnly: true, section: 'Debt recovery' },
  { to: '/debtors', label: 'Debtor Lists', icon: HandCoins, permission: 'debtors:view', section: 'Debt recovery' },
  { to: '/reports', label: 'Reports', icon: BarChart3, permission: 'reports:view', section: 'Insights' },
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/admin', label: 'Administration', icon: Settings, permission: 'admin' },
];
