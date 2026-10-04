-- Fill a missing category slug at the database boundary.
-- Run once in Supabase SQL Editor after the categories table exists.
create or replace function public.fill_category_slug()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  base_slug text;
  candidate_slug text;
  suffix integer := 2;
begin
  if nullif(btrim(new.slug), '') is not null then
    return new;
  end if;

  base_slug := trim(both '-' from regexp_replace(
    lower(btrim(coalesce(new.name, ''))),
    '[^a-z0-9]+',
    '-',
    'g'
  ));
  if base_slug = '' then
    base_slug := 'category';
  end if;
  candidate_slug := base_slug;

  while exists (
    select 1 from public.categories
    where slug = candidate_slug and id is distinct from new.id
  ) loop
    candidate_slug := base_slug || '-' || suffix;
    suffix := suffix + 1;
  end loop;

  new.slug := candidate_slug;
  return new;
end;
$$;

drop trigger if exists categories_fill_slug on public.categories;
create trigger categories_fill_slug
before insert or update of name on public.categories
for each row execute function public.fill_category_slug();
