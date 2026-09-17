import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Pencil, Search, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { toOptions, useLookups, useOfficers } from '@/hooks/useLookups';
import { ROLE_LABEL, ROLES } from '@/lib/constants';
import { qk } from '@/lib/queryClient';
import { errorMessage } from '@/services/errors';
import { officersService } from '@/services/officers';
import { profilesService } from '@/services/profiles';
import type { Profile, Role } from '@/types';
import { Avatar, Badge, Button, Card, DataTable, ErrorState, Field, Input, Modal, Select, Switch } from '@/components/ui';
import { formatDate } from '@/utils/format';

const inviteSchema = z
  .object({
    full_name: z.string().trim().min(2, 'Full name is required'),
    email: z.string().trim().email('Enter a valid email'),
    phone: z.string().trim(),
    role: z.enum(['admin', 'supervisor', 'agent', 'dm_officer']),
    region: z.string(),
    officer_id: z.string(),
    mode: z.enum(['invite', 'password']),
    password: z.string(),
  })
  .refine((v) => v.mode === 'invite' || v.password.length >= 8, { path: ['password'], message: 'At least 8 characters' });
type InviteValues = z.infer<typeof inviteSchema>;

function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { lookups } = useLookups();
  const { data: officers = [] } = useOfficers();
  const form = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { full_name: '', email: '', phone: '', role: 'agent', region: '', officer_id: '', mode: 'invite', password: '' },
  });
  const { register, handleSubmit, watch, reset, formState } = form;
  const role = watch('role');
  const mode = watch('mode');
  const invite = useMutation({
    mutationFn: (v: InviteValues) =>
      profilesService.invite({
        email: v.email,
        full_name: v.full_name,
        phone: v.phone || null,
        role: v.role,
        region: v.region || null,
        officer_id: v.role === 'dm_officer' && v.officer_id ? v.officer_id : null,
        mode: v.mode,
        password: v.mode === 'password' ? v.password : undefined,
      }),
    onSuccess: (_d, v) => {
      toast.success(v.mode === 'invite' ? `Invitation sent to ${v.email}` : `Account created for ${v.email}`);
      queryClient.invalidateQueries({ queryKey: qk.profiles });
      queryClient.invalidateQueries({ queryKey: qk.officers });
      reset();
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const e = formState.errors;
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Add user"
      description="Requires the invite-user edge function (see README)."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={invite.isPending} onClick={handleSubmit((v) => invite.mutate(v))}>
            {mode === 'invite' ? 'Send invitation' : 'Create account'}
          </Button>
        </>
      }
    >
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit((v) => invite.mutate(v))} noValidate>
        <Field label="Full name" htmlFor="u-name" required error={e.full_name?.message}>
          <Input id="u-name" data-autofocus invalid={!!e.full_name} {...register('full_name')} />
        </Field>
        <Field label="Email" htmlFor="u-email" required error={e.email?.message}>
          <Input id="u-email" type="email" invalid={!!e.email} {...register('email')} />
        </Field>
        <Field label="Phone" htmlFor="u-phone">
          <Input id="u-phone" type="tel" {...register('phone')} />
        </Field>
        <Field label="Role" htmlFor="u-role" required hint={ROLES.find((r) => r.value === role)?.description}>
          <Select id="u-role" clearable={false} options={ROLES.map((r) => ({ value: r.value, label: r.label }))} {...register('role')} />
        </Field>
        <Field label="Region" htmlFor="u-region">
          <Select id="u-region" placeholder="No region" options={toOptions(lookups.regions)} {...register('region')} />
        </Field>
        {role === 'dm_officer' && (
          <Field label="Link to officer record" htmlFor="u-officer" hint="Tickets assigned to this officer become visible to the user.">
            <Select
              id="u-officer"
              placeholder="Choose officer"
              options={officers.map((o) => ({ value: o.id, label: `${o.full_name}${o.profile_id ? ' (already linked)' : ''}` }))}
              {...register('officer_id')}
            />
          </Field>
        )}
        <Field label="Account setup" htmlFor="u-mode" className="sm:col-span-2">
          <Select
            id="u-mode"
            clearable={false}
            options={[
              { value: 'invite', label: 'Email an invitation link (user sets their own password)' },
              { value: 'password', label: 'Set a temporary password now' },
            ]}
            {...register('mode')}
          />
        </Field>
        {mode === 'password' && (
          <Field label="Temporary password" htmlFor="u-pass" required error={e.password?.message} hint="Share it securely and ask the user to change it.">
            <Input id="u-pass" type="text" autoComplete="off" invalid={!!e.password} {...register('password')} />
          </Field>
        )}
      </form>
    </Modal>
  );
}

function EditUserDialog({ profile, onClose }: { profile: Profile | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { lookups } = useLookups();
  const { data: officers = [] } = useOfficers();
  const { user } = useAuth();
  const [role, setRole] = useState<Role>(profile?.role ?? 'agent');
  const [region, setRegion] = useState(profile?.region ?? '');
  const [name, setName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const linked = officers.find((o) => o.profile_id === profile?.id);
  const [officerId, setOfficerId] = useState(linked?.id ?? '');
  const isSelf = profile?.id === user?.id;

  const save = useMutation({
    mutationFn: async () => {
      if (!profile) return;
      await profilesService.update(profile.id, { full_name: name.trim(), phone: phone.trim() || null, role, region: region || null });
      if ((linked?.id ?? '') !== officerId) {
        if (linked) await officersService.linkProfile(linked.id, null);
        if (officerId) await officersService.linkProfile(officerId, profile.id);
      }
    },
    onSuccess: () => {
      toast.success('User updated');
      queryClient.invalidateQueries({ queryKey: qk.profiles });
      queryClient.invalidateQueries({ queryKey: qk.officers });
      queryClient.invalidateQueries({ queryKey: qk.workload });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Modal
      open={!!profile}
      onClose={onClose}
      title={`Edit ${profile?.full_name ?? ''}`}
      description={profile?.email}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} disabled={name.trim().length < 2} onClick={() => save.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="e-name">
          <Input id="e-name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Phone" htmlFor="e-phone">
          <Input id="e-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="Role" htmlFor="e-role" hint={isSelf ? 'You cannot remove your own admin role.' : undefined}>
          <Select
            id="e-role"
            clearable={false}
            disabled={isSelf}
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            options={ROLES.map((r) => ({ value: r.value, label: r.label }))}
          />
        </Field>
        <Field label="Region" htmlFor="e-region">
          <Select id="e-region" placeholder="No region" value={region} onChange={(e) => setRegion(e.target.value)} options={toOptions(lookups.regions)} />
        </Field>
        <Field label="Linked officer" htmlFor="e-officer" className="sm:col-span-2" hint="DM Officers see tickets assigned to their linked officer record.">
          <Select
            id="e-officer"
            placeholder="Not linked"
            value={officerId}
            onChange={(e) => setOfficerId(e.target.value)}
            options={officers.map((o) => ({
              value: o.id,
              label: `${o.full_name}${o.profile_id && o.profile_id !== profile?.id ? ' (linked to another user)' : ''}`,
            }))}
          />
        </Field>
      </div>
    </Modal>
  );
}

export function UsersAdmin() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: officers = [] } = useOfficers();
  const { data = [], isLoading, error, refetch } = useQuery({ queryKey: qk.profiles, queryFn: profilesService.list });
  const [q, setQ] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);

  const toggleActive = useMutation({
    mutationFn: (p: Profile) => profilesService.update(p.id, { is_active: !p.is_active }),
    onSuccess: (p) => {
      toast.success(`${p.full_name} ${p.is_active ? 'activated' : 'deactivated'}`);
      queryClient.invalidateQueries({ queryKey: qk.profiles });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const rows = data.filter(
    (p) => !q || `${p.full_name} ${p.email} ${p.region ?? ''} ${ROLE_LABEL[p.role]}`.toLowerCase().includes(q.toLowerCase()),
  );

  const columns = useMemo<ColumnDef<Profile, unknown>[]>(
    () => [
      {
        id: 'name',
        header: 'User',
        accessorKey: 'full_name',
        cell: ({ row }) => (
          <span className="flex items-center gap-2.5">
            <Avatar name={row.original.full_name} size="sm" />
            <span className="min-w-0">
              <span className="block font-medium text-slate-900 dark:text-white">
                {row.original.full_name} {row.original.id === user?.id && <Badge tone="blue">you</Badge>}
              </span>
              <span className="block text-xs text-slate-500">{row.original.email}</span>
            </span>
          </span>
        ),
      },
      {
        id: 'role',
        header: 'Role',
        accessorKey: 'role',
        cell: ({ row }) => <Badge tone={row.original.role === 'admin' ? 'gold' : row.original.role === 'supervisor' ? 'violet' : row.original.role === 'dm_officer' ? 'green' : 'gray'}>{ROLE_LABEL[row.original.role]}</Badge>,
      },
      { id: 'region', header: 'Region', accessorKey: 'region', cell: ({ row }) => row.original.region ?? '—' },
      {
        id: 'officer',
        header: 'Officer record',
        enableSorting: false,
        cell: ({ row }) => officers.find((o) => o.profile_id === row.original.id)?.full_name ?? (row.original.role === 'dm_officer' ? <span className="text-xs font-medium text-amber-700">Not linked</span> : '—'),
      },
      { id: 'created', header: 'Added', accessorKey: 'created_at', cell: ({ row }) => formatDate(row.original.created_at) },
      {
        id: 'active',
        header: 'Active',
        accessorKey: 'is_active',
        cell: ({ row }) => (
          <span onClick={(e) => e.stopPropagation()}>
            <Switch
              label={`${row.original.is_active ? 'Deactivate' : 'Activate'} ${row.original.full_name}`}
              checked={row.original.is_active}
              disabled={row.original.id === user?.id || toggleActive.isPending}
              onChange={() => toggleActive.mutate(row.original)}
            />
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${row.original.full_name}`} onClick={() => setEditing(row.original)}>
            <Pencil className="size-4" />
          </Button>
        ),
      },
    ],
    [officers, user?.id, toggleActive],
  );

  if (error) return <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />;

  return (
    <Card>
      <DataTable<Profile>
        data={rows}
        columns={columns}
        loading={isLoading}
        getRowId={(r) => r.id}
        onRowClick={setEditing}
        clientPageSize={25}
        caption="Users"
        toolbar={
          <>
            <Input aria-label="Search users" leftIcon={<Search />} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search users…" className="w-64" />
            <Button className="ml-auto" leftIcon={<UserPlus className="size-4" />} onClick={() => setInviteOpen(true)}>
              Add user
            </Button>
          </>
        }
      />
      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />
      {editing && <EditUserDialog key={editing.id} profile={editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}
