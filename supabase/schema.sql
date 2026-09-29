-- Bonvoyage database schema (Phase 1)
-- Run once in the Supabase dashboard: SQL Editor > New query > paste this whole file > Run.
-- Safe to re-run: it only creates things that don't exist yet.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.place_category as enum ('restaurants', 'bars', 'hotels', 'sports', 'sights');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.place_status as enum ('approved', 'pending', 'rejected', 'closed');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Profiles: one per account, created automatically at sign-up
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  display_name        text check (char_length(display_name) <= 40),
  home_city           text check (char_length(home_city) <= 60),
  taste               jsonb not null default '{}'::jsonb,   -- per category: { restaurants: { spicy: 2, sweet: -2, ... } }
  weights             jsonb not null default '{}'::jsonb,   -- per category: { hotels: { comfort: 9, pool: 2, ... } }
  budgets             jsonb not null default '{}'::jsonb,   -- per category: { hotels: 350, ... }
  learn_from_ratings  boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Places: imported from OpenStreetMap (source 'osm') or added by users (source 'user', starts as pending)
-- ---------------------------------------------------------------------------
create table if not exists public.places (
  id            bigint generated always as identity primary key,
  osm_type      text check (osm_type in ('node', 'way', 'relation')),
  osm_id        bigint,
  city          text not null,
  category      public.place_category not null,
  type          text,                          -- e.g. 'Thai', 'Brewery taproom', 'Boutique'
  name          text not null check (char_length(name) between 1 and 120),
  address       text,
  neighbourhood text,
  lat           double precision,
  lon           double precision,
  status        public.place_status not null default 'pending',
  source        text not null default 'user' check (source in ('osm', 'user')),
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (osm_type, osm_id)
);
create index if not exists places_city_category_idx on public.places (city, category) where status = 'approved';
create index if not exists places_created_by_idx on public.places (created_by);

-- ---------------------------------------------------------------------------
-- Ratings: one per place per account (editable)
-- ---------------------------------------------------------------------------
create table if not exists public.ratings (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  place_id    bigint not null references public.places (id) on delete cascade,
  overall     numeric(2, 1) not null check (overall between 1 and 5 and overall * 2 = floor(overall * 2)),
  criteria    jsonb not null default '{}'::jsonb,  -- { comfort: 4.5, pool: null (doesn't have one), ... }
  tags        text[] not null default '{}',        -- { spicy, smoky }
  spend       numeric(8, 2) check (spend >= 0),
  visited_on  date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, place_id)
);
create index if not exists ratings_place_idx on public.ratings (place_id);

-- ---------------------------------------------------------------------------
-- Keep updated_at current
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
drop trigger if exists places_touch on public.places;
create trigger places_touch before update on public.places for each row execute function public.touch_updated_at();
drop trigger if exists ratings_touch on public.ratings;
create trigger ratings_touch before update on public.ratings for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Create a profile automatically for every new account
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row-level security: who can read and write what
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.places   enable row level security;
alter table public.ratings  enable row level security;

-- Profiles: you see and edit only your own
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select to authenticated using ((select auth.uid()) = id);
drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- Places: everyone sees approved places; you also see the ones you added
drop policy if exists "read approved places" on public.places;
create policy "read approved places" on public.places for select to anon, authenticated
  using (status = 'approved' or created_by = (select auth.uid()));
-- Signed-in users can suggest a place; it waits for review
drop policy if exists "suggest a place" on public.places;
create policy "suggest a place" on public.places for insert to authenticated
  with check (created_by = (select auth.uid()) and status = 'pending' and source = 'user');

-- Ratings: private. You see and manage only your own; everyone else sees combined scores (get_place_scores below)
drop policy if exists "read own ratings" on public.ratings;
create policy "read own ratings" on public.ratings for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "add own rating" on public.ratings;
create policy "add own rating" on public.ratings for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.places p where p.id = place_id and (p.status = 'approved' or p.created_by = (select auth.uid())))
  );
drop policy if exists "edit own rating" on public.ratings;
create policy "edit own rating" on public.ratings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "delete own rating" on public.ratings;
create policy "delete own rating" on public.ratings for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Combined scores per place, without exposing anyone's individual ratings
-- ---------------------------------------------------------------------------
create or replace function public.get_place_scores(p_city text, p_category public.place_category)
returns table (place_id bigint, n integer, avg_overall numeric)
language sql stable security definer set search_path = '' as $$
  select r.place_id, count(*)::integer, round(avg(r.overall), 2)
  from public.ratings r
  join public.places p on p.id = r.place_id
  where p.city = p_city and p.category = p_category and p.status = 'approved'
  group by r.place_id;
$$;
revoke all on function public.get_place_scores(text, public.place_category) from public;
grant execute on function public.get_place_scores(text, public.place_category) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Delete my account (profile and ratings go with it via cascade)
-- ---------------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ===========================================================================
-- Update 002 (also in 002_place_search.sql): add places from search, list places in any city
-- ===========================================================================

create index if not exists places_lat_lon_idx on public.places (lat, lon) where status = 'approved';

-- Add a place picked from search (or typed in by address). Returns the place's id.
-- If the same OpenStreetMap place was already added, returns the existing one instead of a duplicate.
create or replace function public.add_place(
  p_category      public.place_category,
  p_name          text,
  p_lat           double precision,
  p_lon           double precision,
  p_type          text default null,
  p_address       text default null,
  p_neighbourhood text default null,
  p_city          text default null,
  p_osm_type      text default null,
  p_osm_id        bigint default null
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_id bigint;
  v_recent integer;
begin
  if v_user is null then
    raise exception 'Sign in to add a place';
  end if;
  if p_name is null or char_length(trim(p_name)) = 0 or char_length(p_name) > 120 then
    raise exception 'Place name must be 1 to 120 characters';
  end if;
  if p_lat is null or p_lon is null or p_lat not between -90 and 90 or p_lon not between -180 and 180 then
    raise exception 'Place needs a valid location';
  end if;
  if p_osm_type is not null and p_osm_type not in ('node', 'way', 'relation') then
    raise exception 'Unknown OpenStreetMap type';
  end if;

  -- Already here? Same OpenStreetMap object, or same name within about 100 m
  if p_osm_id is not null then
    select id into v_id from public.places where osm_type = p_osm_type and osm_id = p_osm_id;
  end if;
  if v_id is null then
    select id into v_id from public.places
    where lower(name) = lower(trim(p_name)) and abs(lat - p_lat) < 0.001 and abs(lon - p_lon) < 0.0014
    limit 1;
  end if;
  if v_id is not null then
    return v_id;
  end if;

  -- Limit how fast one account can add places
  select count(*) into v_recent from public.places where created_by = v_user and created_at > now() - interval '1 day';
  if v_recent >= 40 then
    raise exception 'You have added a lot of places today. Try again tomorrow.';
  end if;

  insert into public.places (osm_type, osm_id, city, category, type, name, address, neighbourhood, lat, lon, status, source, created_by)
  values (p_osm_type, p_osm_id, coalesce(nullif(trim(p_city), ''), 'Unknown'), p_category, nullif(trim(p_type), ''),
          trim(p_name), nullif(trim(p_address), ''), nullif(trim(p_neighbourhood), ''), p_lat, p_lon,
          'approved', case when p_osm_id is null then 'user' else 'osm' end, v_user)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.add_place(public.place_category, text, double precision, double precision, text, text, text, text, text, bigint) from public, anon;
grant execute on function public.add_place(public.place_category, text, double precision, double precision, text, text, text, text, text, bigint) to authenticated;

-- Places inside an area (a city's bounds), with combined scores. Individual ratings stay private.
create or replace function public.get_places_in_area(
  p_min_lat double precision, p_max_lat double precision,
  p_min_lon double precision, p_max_lon double precision,
  p_category public.place_category
) returns table (
  id bigint, name text, type text, address text, neighbourhood text, city text,
  lat double precision, lon double precision, source text, osm_type text, osm_id bigint,
  n integer, avg_overall numeric
)
language sql stable security definer set search_path = '' as $$
  select p.id, p.name, p.type, p.address, p.neighbourhood, p.city, p.lat, p.lon, p.source, p.osm_type, p.osm_id,
         count(r.id)::integer, round(avg(r.overall), 2)
  from public.places p
  left join public.ratings r on r.place_id = p.id
  where p.status = 'approved' and p.category = p_category
    and p.lat between p_min_lat and p_max_lat and p.lon between p_min_lon and p_max_lon
  group by p.id
  order by count(r.id) desc, p.name
  limit 500;
$$;
revoke all on function public.get_places_in_area(double precision, double precision, double precision, double precision, public.place_category) from public;
grant execute on function public.get_places_in_area(double precision, double precision, double precision, double precision, public.place_category) to anon, authenticated;

-- ===========================================================================
-- Update 003 (also in 003_ratings.sql): rating checks and community breakdown
-- ===========================================================================

-- Check every rating before it is saved, whatever app sends it
create or replace function public.validate_rating()
returns trigger language plpgsql set search_path = '' as $$
declare
  k text;
  v jsonb;
  n numeric;
begin
  if new.criteria is null then new.criteria := '{}'::jsonb; end if;
  if jsonb_typeof(new.criteria) <> 'object' then
    raise exception 'Detail scores are in the wrong format';
  end if;
  if (select count(*) from jsonb_object_keys(new.criteria)) > 20 then
    raise exception 'Too many detail scores';
  end if;
  for k, v in select key, value from jsonb_each(new.criteria) loop
    if char_length(k) > 20 then
      raise exception 'Unknown detail score';
    end if;
    continue when jsonb_typeof(v) = 'null';  -- null means "doesn't have one" (no pool, no gym)
    if jsonb_typeof(v) <> 'number' then
      raise exception 'Detail scores must be numbers';
    end if;
    n := (v #>> '{}')::numeric;
    if n < 1 or n > 5 or n * 2 <> floor(n * 2) then
      raise exception 'Detail scores must be 1 to 5 in half steps';
    end if;
  end loop;
  if new.tags is null then new.tags := '{}'; end if;
  if cardinality(new.tags) > 12 or exists (select 1 from unnest(new.tags) t where char_length(t) > 20) then
    raise exception 'Too many tags';
  end if;
  new.tags := array(select distinct t from unnest(new.tags) t order by t);
  if new.spend is not null and new.spend > 100000 then
    raise exception 'That amount looks too high';
  end if;
  return new;
end $$;

drop trigger if exists ratings_validate on public.ratings;
create trigger ratings_validate before insert or update on public.ratings for each row execute function public.validate_rating();

-- Community breakdown for one place: averages and tag counts only, never who rated what
create or replace function public.get_place_breakdown(p_place_id bigint)
returns jsonb
language sql stable security definer set search_path = '' as $$
  with r as (
    select r.* from public.ratings r
    join public.places p on p.id = r.place_id
    where r.place_id = p_place_id and p.status = 'approved'
  )
  select jsonb_build_object(
    'n', (select count(*) from r),
    'overall', (select round(avg(overall), 2) from r),
    'spend', (select round(avg(spend)) from r where spend is not null),
    'criteria', coalesce((
      select jsonb_object_agg(key, avg_v) from (
        select e.key, round(avg((e.value #>> '{}')::numeric), 2) as avg_v
        from r, jsonb_each(r.criteria) e where jsonb_typeof(e.value) = 'number' group by e.key
      ) s), '{}'::jsonb),
    'missing', coalesce((
      select jsonb_object_agg(key, c) from (
        select e.key, count(*) as c from r, jsonb_each(r.criteria) e where jsonb_typeof(e.value) = 'null' group by e.key
      ) s), '{}'::jsonb),
    'tags', coalesce((
      select jsonb_object_agg(t, c) from (
        select t, count(*) as c from r, unnest(r.tags) t group by t
      ) s), '{}'::jsonb)
  );
$$;
revoke all on function public.get_place_breakdown(bigint) from public;
grant execute on function public.get_place_breakdown(bigint) to anon, authenticated;

-- ===========================================================================
-- Update 004 (also in 004_photos.sql): labelled photos
-- ===========================================================================

-- Storage folder for photos. Public so photos load fast; uploads limited to 3 MB JPEG/WebP.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('place-photos', 'place-photos', true, 3145728, array['image/jpeg', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 3145728, allowed_mime_types = array['image/jpeg', 'image/webp'];

-- Which photo belongs to which place, which slot it fills (Main, Room, Drinks...) and who added it.
-- Files live at place-photos/<place id>/<user id>/<slot>-<random>.jpg
create table if not exists public.place_photos (
  id          bigint generated always as identity primary key,
  place_id    bigint not null references public.places (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  slot        text not null,
  path        text not null unique check (char_length(path) < 200),
  width       integer check (width between 1 and 4000),
  height      integer check (height between 1 and 4000),
  created_at  timestamptz not null default now(),
  unique (place_id, user_id, slot)   -- one photo per slot per person
);
create index if not exists place_photos_place_idx on public.place_photos (place_id, created_at desc);
alter table public.place_photos enable row level security;

-- Photo slots per category. Keep in sync with "photos" in src/lib/categories.js
create or replace function public.photo_slots(p_category public.place_category)
returns text[] language sql immutable set search_path = '' as $$
  select case p_category
    when 'restaurants' then array['app', 'main', 'dessert', 'vibe']
    when 'bars'        then array['drinks', 'vibe']
    when 'hotels'      then array['room', 'bathroom', 'view', 'common']
    when 'sports'      then array['seat', 'atmos', 'food']
    when 'sights'      then array['highlight', 'view', 'crowds']
  end;
$$;

-- Reject a photo whose slot doesn't belong to the place's category
create or replace function public.check_photo_slot()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_category public.place_category;
begin
  select category into v_category from public.places where id = new.place_id;
  if not (new.slot = any (public.photo_slots(v_category))) then
    raise exception 'That photo type doesn''t fit this kind of place';
  end if;
  return new;
end $$;
drop trigger if exists place_photos_slot on public.place_photos;
create trigger place_photos_slot before insert or update on public.place_photos for each row execute function public.check_photo_slot();

-- Anyone can see photos of approved places
drop policy if exists "read photos" on public.place_photos;
create policy "read photos" on public.place_photos for select to anon, authenticated
  using (exists (select 1 from public.places p where p.id = place_id and (p.status = 'approved' or p.created_by = (select auth.uid()))));

-- You can add photos only in your own folder
drop policy if exists "add own photo" on public.place_photos;
create policy "add own photo" on public.place_photos for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and path like place_id::text || '/' || (select auth.uid())::text || '/%'
    and exists (select 1 from public.places p where p.id = place_id and (p.status = 'approved' or p.created_by = (select auth.uid())))
  );

drop policy if exists "delete own photo" on public.place_photos;
create policy "delete own photo" on public.place_photos for delete to authenticated using (user_id = (select auth.uid()));

-- The files themselves: upload and delete only inside your own folder (<place id>/<your user id>/...)
drop policy if exists "upload own place photos" on storage.objects;
create policy "upload own place photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'place-photos' and (storage.foldername(name))[2] = (select auth.uid())::text);

drop policy if exists "delete own place photos" on storage.objects;
create policy "delete own place photos" on storage.objects for delete to authenticated
  using (bucket_id = 'place-photos' and (storage.foldername(name))[2] = (select auth.uid())::text);
