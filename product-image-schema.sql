-- Add the product photo URL used by the admin panel.
-- Run after the base TokaToka schema has created public.products and profiles.
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

alter table public.products
add column if not exists image_url text,
add column if not exists preparation_time integer not null default 15,
add column if not exists price numeric(10,2) not null default 0,
add column if not exists serving_size text;

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Public read product images" on storage.objects;
create policy "Public read product images" on storage.objects
for select to public using (bucket_id = 'product-images');

drop policy if exists "Staff admin upload product images" on storage.objects;
create policy "Staff admin upload product images" on storage.objects
for insert to authenticated
with check (bucket_id = 'product-images' and public.is_staff_or_admin());

drop policy if exists "Staff admin update product images" on storage.objects;
create policy "Staff admin update product images" on storage.objects
for update to authenticated
using (bucket_id = 'product-images' and public.is_staff_or_admin())
with check (bucket_id = 'product-images' and public.is_staff_or_admin());

drop policy if exists "Staff admin delete product images" on storage.objects;
create policy "Staff admin delete product images" on storage.objects
for delete to authenticated
using (bucket_id = 'product-images' and public.is_staff_or_admin());
