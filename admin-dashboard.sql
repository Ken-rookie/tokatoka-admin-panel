-- Dashboard events and promotional image storage.
-- Run after admin-policies.sql in the same Supabase project.

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  discount_percent numeric(5,2) not null default 0
    check (discount_percent >= 0 and discount_percent <= 100),
  image_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

alter table public.events enable row level security;

drop policy if exists "Public read active events" on public.events;
create policy "Public read active events" on public.events
for select to public
using (
  is_active
  and (starts_at is null or starts_at <= now())
  and (ends_at is null or ends_at > now())
);

drop policy if exists "Staff admin manage events" on public.events;
create policy "Staff admin manage events" on public.events
for all to authenticated
using (public.is_staff_or_admin())
with check (public.is_staff_or_admin());

create table if not exists public.event_products (
  event_id uuid not null references public.events(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, product_id)
);

alter table public.event_products enable row level security;

drop policy if exists "Public read active event products" on public.event_products;
create policy "Public read active event products" on public.event_products
for select to public
using (
  exists (
    select 1 from public.events
    where events.id = event_products.event_id
      and events.is_active
      and (events.starts_at is null or events.starts_at <= now())
      and (events.ends_at is null or events.ends_at > now())
  )
);

drop policy if exists "Staff admin manage event products" on public.event_products;
create policy "Staff admin manage event products" on public.event_products
for all to authenticated
using (public.is_staff_or_admin())
with check (public.is_staff_or_admin());

create or replace function public.set_event_products(
  p_event_id uuid,
  p_product_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_staff_or_admin() then
    raise exception 'Only staff and admins can assign event products.';
  end if;

  delete from public.event_products where event_id = p_event_id;

  insert into public.event_products (event_id, product_id)
  select p_event_id, selected.product_id
  from unnest(coalesce(p_product_ids, array[]::uuid[])) as selected(product_id)
  on conflict (event_id, product_id) do nothing;
end;
$$;

revoke all on function public.set_event_products(uuid, uuid[]) from public;
grant execute on function public.set_event_products(uuid, uuid[]) to authenticated;

insert into storage.buckets (id, name, public)
values ('event-images', 'event-images', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Public read event images" on storage.objects;
create policy "Public read event images" on storage.objects
for select to public using (bucket_id = 'event-images');

drop policy if exists "Staff admin upload event images" on storage.objects;
create policy "Staff admin upload event images" on storage.objects
for insert to authenticated
with check (bucket_id = 'event-images' and public.is_staff_or_admin());

drop policy if exists "Staff admin update event images" on storage.objects;
create policy "Staff admin update event images" on storage.objects
for update to authenticated
using (bucket_id = 'event-images' and public.is_staff_or_admin())
with check (bucket_id = 'event-images' and public.is_staff_or_admin());

drop policy if exists "Staff admin delete event images" on storage.objects;
create policy "Staff admin delete event images" on storage.objects
for delete to authenticated
using (bucket_id = 'event-images' and public.is_staff_or_admin());
