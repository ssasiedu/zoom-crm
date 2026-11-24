-- =====================================================================
-- Show which field officers can actually sign in.
--
-- Creating an officer record says who someone is and which district they
-- cover. It does not give them a login — that is a user account under
-- Administration → Users, joined to the officer record. The two steps
-- are easy to confuse, and an officer who has had work forwarded to them
-- but no account never finds out.
--
-- So the region tree now reports, per officer, whether an account is
-- joined to them and whether that account can be sent a password reset
-- by email. The screen uses it to flag the gap.
-- =====================================================================

create or replace function public.region_district_officers()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if public.auth_role() is null then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(r) order by r.sort_order, r.region)
    from (
      select g.name as region,
             g.sort_order,
             (select coalesce(jsonb_agg(to_jsonb(m) order by m.full_name), '[]'::jsonb)
                from (select o.id, o.full_name, o.phone, o.email, o.is_active,
                             (o.profile_id is not null) as has_login,
                             coalesce(p.is_active, false) as login_active
                        from public.officers o
                        left join public.profiles p on p.id = o.profile_id
                       where o.kind = 'regional_manager' and o.region = g.name) m
             ) as managers,
             (select coalesce(jsonb_agg(to_jsonb(d) order by d.sort_order, d.district), '[]'::jsonb)
                from (
                  select dd.name as district,
                         dd.sort_order,
                         dd.is_active,
                         (select coalesce(jsonb_agg(to_jsonb(o2) order by o2.full_name), '[]'::jsonb)
                            from (select o.id, o.full_name, o.phone, o.email, o.is_active,
                                         mo.full_name as manager_name,
                                         (o.profile_id is not null) as has_login,
                                         coalesce(p.is_active, false) as login_active,
                                         p.email as login_email
                                    from public.officers o
                                    left join public.officers mo on mo.id = o.manager_officer_id
                                    left join public.profiles p on p.id = o.profile_id
                                   where o.kind = 'district_officer' and o.district = dd.name) o2
                         ) as officers
                    from public.districts dd
                   where dd.region = g.name
                ) d
             ) as districts
        from public.regions g
    ) r
  ), '[]'::jsonb);
end $$;

grant execute on function public.region_district_officers() to authenticated, service_role;
