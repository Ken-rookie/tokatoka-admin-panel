-- TokaToka admin/staff RLS policies
-- Run this AFTER supabase/schema.sql in the same Supabase project.
-- Uses the public anon/publishable key safely by checking the signed-in user's role server-side.

alter type public.payment_status add value if not exists 'cancelled';
alter type public.order_status add value if not exists 'pending';
alter type public.order_status add value if not exists 'confirmed';
alter type public.order_status add value if not exists 'preparing';
alter type public.order_status add value if not exists 'on_transit';
alter type public.order_status add value if not exists 'delivered';
alter type public.order_status add value if not exists 'cancelled';

create or replace function public.is_staff_or_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('staff','admin')
  );
$$;

revoke all on function public.is_staff_or_admin() from public;
grant execute on function public.is_staff_or_admin() to authenticated;

-- Profiles / customers
drop policy if exists "staff admin read profiles" on public.profiles;
create policy "staff admin read profiles" on public.profiles
for select using (public.is_staff_or_admin() or auth.uid() = id);
drop policy if exists "admin update profiles" on public.profiles;
create policy "admin update profiles" on public.profiles
for update using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

-- Categories
drop policy if exists "staff admin manage categories" on public.categories;
create policy "staff admin manage categories" on public.categories
for all using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

-- Products
drop policy if exists "staff admin manage products" on public.products;
create policy "staff admin manage products" on public.products
for all using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

-- Orders
drop policy if exists "staff admin read all orders" on public.orders;
create policy "staff admin read all orders" on public.orders
for select using (public.is_staff_or_admin() or auth.uid() = user_id);
drop policy if exists "staff admin update orders" on public.orders;
create policy "staff admin update orders" on public.orders
for update using (public.is_staff_or_admin() and status::text <> 'cancelled')
with check (public.is_staff_or_admin());

create or replace function public.cancel_pending_order_payment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'cancelled' then
    execute 'select ''cancelled''::public.payment_status'
    into new.payment_status;

    update public.payments
    set status = 'cancelled'
    where order_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists cancel_pending_order_payment on public.orders;
create trigger cancel_pending_order_payment
before update of status on public.orders
for each row execute function public.cancel_pending_order_payment();

-- Order items
drop policy if exists "staff admin read all order items" on public.order_items;
create policy "staff admin read all order items" on public.order_items
for select using (public.is_staff_or_admin() or exists (
  select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()
));

-- Addresses
drop policy if exists "staff admin read all addresses" on public.addresses;
create policy "staff admin read all addresses" on public.addresses
for select using (public.is_staff_or_admin() or auth.uid() = user_id);

-- Payments
drop policy if exists "staff admin read payments" on public.payments;
create policy "staff admin read payments" on public.payments
for select using (public.is_staff_or_admin());

-- Reviews
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  order_item_id uuid references public.order_items(id) on delete cascade,
  rating integer check (rating between 1 and 5),
  comment text,
  image_url text,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, order_item_id)
);
alter table public.reviews enable row level security;
drop policy if exists "staff admin manage reviews" on public.reviews;
create policy "staff admin manage reviews" on public.reviews
for all using (public.is_staff_or_admin())
with check (public.is_staff_or_admin());

-- Notifications (admin panel can inspect/manage notifications if needed)
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.notifications enable row level security;
drop policy if exists "staff admin read notifications" on public.notifications;
create policy "staff admin read notifications" on public.notifications
for select using (public.is_staff_or_admin() or auth.uid() = user_id);
drop policy if exists "staff admin manage notifications" on public.notifications;
create policy "staff admin manage notifications" on public.notifications
for all using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());
