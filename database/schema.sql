-- WeatherApp: таблица сохранённых городов.
-- Выполни весь скрипт в Supabase Dashboard → SQL Editor.

create table if not exists public.saved_cities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  name text not null,
  country text not null default '',
  latitude double precision not null,
  longitude double precision not null,
  created_at timestamptz not null default now(),

  constraint saved_cities_latitude_range
    check (latitude >= -90 and latitude <= 90),
  constraint saved_cities_longitude_range
    check (longitude >= -180 and longitude <= 180),
  constraint saved_cities_unique_per_user
    unique (user_id, latitude, longitude)
);

alter table public.saved_cities enable row level security;

-- Remove policies with these names first, so this script can be run again.
drop policy if exists "Read own saved cities" on public.saved_cities;
drop policy if exists "Insert own saved cities" on public.saved_cities;
drop policy if exists "Delete own saved cities" on public.saved_cities;

create policy "Read own saved cities"
on public.saved_cities
for select
to authenticated
using (
  (select auth.uid()) = user_id
  and (select (auth.jwt() ->> 'is_anonymous')::boolean) is true
);

create policy "Insert own saved cities"
on public.saved_cities
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and (select (auth.jwt() ->> 'is_anonymous')::boolean) is true
);

create policy "Delete own saved cities"
on public.saved_cities
for delete
to authenticated
using (
  (select auth.uid()) = user_id
  and (select (auth.jwt() ->> 'is_anonymous')::boolean) is true
);

create index if not exists saved_cities_user_id_idx
on public.saved_cities (user_id);
