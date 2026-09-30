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

-- ===========================================================================
-- Update 005 (also in 005_taste.sql): taste profiles and Best for you
-- ===========================================================================

-- Ratings now carry cuisine, ambiance, occasion and dietary tags, so allow a few more per rating
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
    continue when jsonb_typeof(v) = 'null';
    if jsonb_typeof(v) <> 'number' then
      raise exception 'Detail scores must be numbers';
    end if;
    n := (v #>> '{}')::numeric;
    if n < 1 or n > 5 or n * 2 <> floor(n * 2) then
      raise exception 'Detail scores must be 1 to 5 in half steps';
    end if;
  end loop;
  if new.tags is null then new.tags := '{}'; end if;
  if cardinality(new.tags) > 30 or exists (select 1 from unnest(new.tags) t where char_length(t) > 60) then
    raise exception 'Too many tags';
  end if;
  if (select count(*) from unnest(new.tags) t where t like 'c:%') > 2 then
    raise exception 'Pick at most 2 cuisines';
  end if;
  new.tags := array(select distinct t from unnest(new.tags) t order by t);
  if new.spend is not null and new.spend > 100000 then
    raise exception 'That amount looks too high';
  end if;
  return new;
end $$;

-- Places in an area with everything the ranking needs: averages, detail scores and tag counts.
-- Only combined numbers leave the database, never an individual rating.
create or replace function public.get_area_places(
  p_min_lat double precision, p_max_lat double precision,
  p_min_lon double precision, p_max_lon double precision,
  p_category public.place_category
) returns table (
  id bigint, name text, type text, address text, neighbourhood text, city text,
  lat double precision, lon double precision, source text, osm_type text, osm_id bigint,
  n integer, avg_overall numeric, avg_spend numeric, criteria jsonb, missing jsonb, tags jsonb
)
language sql stable security definer set search_path = '' as $$
  with p as (
    select * from public.places
    where status = 'approved' and category = p_category
      and lat between p_min_lat and p_max_lat and lon between p_min_lon and p_max_lon
  ),
  r as (select r.* from public.ratings r join p on p.id = r.place_id)
  select p.id, p.name, p.type, p.address, p.neighbourhood, p.city, p.lat, p.lon, p.source, p.osm_type, p.osm_id,
    (select count(*)::integer from r where r.place_id = p.id),
    (select round(avg(r.overall), 2) from r where r.place_id = p.id),
    (select round(avg(r.spend)) from r where r.place_id = p.id and r.spend is not null),
    coalesce((select jsonb_object_agg(s.key, s.v) from (
      select e.key, round(avg((e.value #>> '{}')::numeric), 2) as v
      from r, jsonb_each(r.criteria) e where r.place_id = p.id and jsonb_typeof(e.value) = 'number' group by e.key) s), '{}'::jsonb),
    coalesce((select jsonb_object_agg(s.key, s.c) from (
      select e.key, count(*) as c
      from r, jsonb_each(r.criteria) e where r.place_id = p.id and jsonb_typeof(e.value) = 'null' group by e.key) s), '{}'::jsonb),
    coalesce((select jsonb_object_agg(s.t, s.c) from (
      select t, count(*) as c from r, unnest(r.tags) t where r.place_id = p.id group by t) s), '{}'::jsonb)
  from p
  limit 1000;
$$;
revoke all on function public.get_area_places(double precision, double precision, double precision, double precision, public.place_category) from public;
grant execute on function public.get_area_places(double precision, double precision, double precision, double precision, public.place_category) to anon, authenticated;

-- ===========================================================================
-- Update 006 (also in 006_matching.sql): travelers like you, popular cities
-- ===========================================================================

create index if not exists ratings_user_idx on public.ratings (user_id);

-- Travelers like you: people whose ratings rise and fall with yours on places you both rated.
-- For each requested place, predicts your score from theirs. Only combined numbers are returned,
-- never who the matching travelers are, and only when at least 2 of them rated the place.
create or replace function public.get_taste_matches(p_place_ids bigint[])
returns table (place_id bigint, predicted numeric, neighbours integer, neighbour_avg numeric)
language sql stable security definer set search_path = '' as $$
  with mine as (
    select r.place_id, r.overall::numeric as o from public.ratings r where r.user_id = auth.uid()
  ),
  my_mean as (select avg(o) as m, count(*) as c from mine),
  others as (
    select r.user_id, r.place_id, r.overall::numeric as o
    from public.ratings r where auth.uid() is not null and r.user_id <> auth.uid()
  ),
  other_means as (select user_id, avg(o) as m from others group by user_id),
  pairs as (
    select ot.user_id, mi.o - (select m from my_mean) as a, ot.o - om.m as b
    from others ot
    join mine mi on mi.place_id = ot.place_id
    join other_means om on om.user_id = ot.user_id
  ),
  agreement as (
    select user_id, count(*) as overlap, sum(a * b) as num, sqrt(sum(a * a)) * sqrt(sum(b * b)) as den
    from pairs group by user_id having count(*) >= 3
  ),
  neighbours as (
    -- Agreement shrunk toward zero when the overlap is small, so 3 lucky matches don't dominate
    select user_id, (num / den) * overlap / (overlap + 5.0) as sim
    from agreement where den > 0 and num > 0
    order by 2 desc limit 40
  )
  select ot.place_id,
         round((select m from my_mean) + sum(nb.sim * (ot.o - om.m)) / sum(nb.sim), 2),
         count(*)::integer,
         round(avg(ot.o), 2)
  from others ot
  join neighbours nb on nb.user_id = ot.user_id
  join other_means om on om.user_id = ot.user_id
  where ot.place_id = any (p_place_ids)
    and (select c from my_mean) >= 3
  group by ot.place_id
  having count(*) >= 2;
$$;
revoke all on function public.get_taste_matches(bigint[]) from public, anon;
grant execute on function public.get_taste_matches(bigint[]) to authenticated;

-- How many travelers currently look like you (shown on your profile)
create or replace function public.count_taste_matches()
returns integer
language sql stable security definer set search_path = '' as $$
  with mine as (select place_id, overall::numeric as o from public.ratings where user_id = auth.uid()),
  my_mean as (select avg(o) as m from mine),
  others as (select user_id, place_id, overall::numeric as o from public.ratings where auth.uid() is not null and user_id <> auth.uid()),
  other_means as (select user_id, avg(o) as m from others group by user_id),
  agreement as (
    select ot.user_id, count(*) as overlap,
           sum((mi.o - (select m from my_mean)) * (ot.o - om.m)) as num
    from others ot join mine mi on mi.place_id = ot.place_id join other_means om on om.user_id = ot.user_id
    group by ot.user_id having count(*) >= 3
  )
  select count(*)::integer from agreement where num > 0;
$$;
revoke all on function public.count_taste_matches() from public, anon;
grant execute on function public.count_taste_matches() to authenticated;

-- Cities with the most activity, for the home page
create or replace function public.get_popular_cities(p_limit integer default 8)
returns table (city text, places integer, ratings integer, lat double precision, lon double precision)
language sql stable security definer set search_path = '' as $$
  select p.city, count(distinct p.id)::integer, count(r.id)::integer, avg(p.lat), avg(p.lon)
  from public.places p
  left join public.ratings r on r.place_id = p.id
  where p.status = 'approved' and p.city <> 'Unknown'
  group by p.city
  order by count(r.id) desc, count(distinct p.id) desc
  limit least(greatest(p_limit, 1), 20);
$$;
revoke all on function public.get_popular_cities(integer) from public;
grant execute on function public.get_popular_cities(integer) to anon, authenticated;

-- ===========================================================================
-- Update 007 (also in 007_seats.sql)
-- ===========================================================================

-- One report per person per venue per event date: where you sat, what you saw, and how the view was.
-- Kept separate from the venue rating because people go to the same arena many times, in different seats.
create table if not exists public.seat_reports (
  id          bigint generated always as identity primary key,
  place_id    bigint not null references public.places (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  section     text not null check (char_length(section) between 1 and 16),
  row_label   text check (char_length(row_label) <= 8),
  seat_label  text check (char_length(seat_label) <= 8),
  event_kind  text not null check (event_kind in ('hockey', 'basketball', 'soccer', 'baseball', 'football', 'concert', 'other')),
  event_name  text check (char_length(event_name) <= 80),
  event_date  date not null,
  view        numeric(2, 1) not null check (view between 1 and 5 and view * 2 = floor(view * 2)),
  value       numeric(2, 1) check (value between 1 and 5 and value * 2 = floor(value * 2)),
  price       numeric(8, 2) check (price >= 0 and price <= 20000),
  photo_path  text check (char_length(photo_path) < 200),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, place_id, event_date)
);
create index if not exists seat_reports_place_idx on public.seat_reports (place_id, section);

drop trigger if exists seat_reports_touch on public.seat_reports;
create trigger seat_reports_touch before update on public.seat_reports for each row execute function public.touch_updated_at();

-- Only for sports venues, no future games, and tidy section names ("sec 312" -> "312")
create or replace function public.check_seat_report()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_category public.place_category;
begin
  select category into v_category from public.places where id = new.place_id;
  if v_category is distinct from 'sports' then
    raise exception 'Seat reports are for sports venues';
  end if;
  if new.event_date > current_date + 1 then
    raise exception 'That date is in the future. Add your seat after the game.';
  end if;
  if new.event_date < date '2000-01-01' then
    raise exception 'That date looks too far back';
  end if;
  new.section := upper(regexp_replace(trim(new.section), '^(sec(tion)?\.?\s*)', '', 'i'));
  new.row_label := nullif(upper(trim(new.row_label)), '');
  new.seat_label := nullif(upper(trim(new.seat_label)), '');
  new.event_name := nullif(trim(new.event_name), '');
  if new.photo_path is not null and new.photo_path not like new.place_id::text || '/' || new.user_id::text || '/%' then
    raise exception 'Photo must be in your own folder';
  end if;
  return new;
end $$;
drop trigger if exists seat_reports_check on public.seat_reports;
create trigger seat_reports_check before insert or update on public.seat_reports for each row execute function public.check_seat_report();

-- Private: you see and manage your own reports; everyone else sees the combined section guide
alter table public.seat_reports enable row level security;
drop policy if exists "read own seat reports" on public.seat_reports;
create policy "read own seat reports" on public.seat_reports for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "add own seat report" on public.seat_reports;
create policy "add own seat report" on public.seat_reports for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.places p where p.id = place_id and p.status = 'approved'));
drop policy if exists "edit own seat report" on public.seat_reports;
create policy "edit own seat report" on public.seat_reports for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "delete own seat report" on public.seat_reports;
create policy "delete own seat report" on public.seat_reports for delete to authenticated using (user_id = (select auth.uid()));

-- Section guide for one venue: per section, the average view, value and price, how many reports,
-- what was on, and up to 6 photos from those seats. Never who sat where or when.
create or replace function public.get_section_guide(p_place_id bigint)
returns table (section text, n integer, avg_view numeric, avg_value numeric, avg_price numeric, kinds jsonb, photos text[])
language sql stable security definer set search_path = '' as $$
  select s.section,
         count(*)::integer,
         round(avg(s.view), 2),
         round(avg(s.value), 2),
         round(avg(s.price)),
         (select jsonb_object_agg(k, c) from (select event_kind as k, count(*) as c from public.seat_reports x
            where x.place_id = p_place_id and x.section = s.section group by event_kind) kk),
         (array(select x.photo_path from public.seat_reports x
            where x.place_id = p_place_id and x.section = s.section and x.photo_path is not null
            order by x.event_date desc limit 6))
  from public.seat_reports s
  join public.places p on p.id = s.place_id and p.status = 'approved'
  where s.place_id = p_place_id
  group by s.section;
$$;
revoke all on function public.get_section_guide(bigint) from public;
grant execute on function public.get_section_guide(bigint) to anon, authenticated;

-- ===========================================================================
-- Update 008 (also in 008_friends.sql)
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Usernames (@paolo): how friends find each other. Lowercase letters, numbers, underscores.
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists handle text;
do $$ begin
  alter table public.profiles add constraint profiles_handle_format check (handle ~ '^[a-z0-9_]{3,20}$');
exception when duplicate_object then null; end $$;
create unique index if not exists profiles_handle_key on public.profiles (handle);

-- ---------------------------------------------------------------------------
-- Friendships: a request from one person to another, accepted or still pending
-- ---------------------------------------------------------------------------
create table if not exists public.friendships (
  id           bigint generated always as identity primary key,
  requester    uuid not null references auth.users (id) on delete cascade,
  addressee    uuid not null references auth.users (id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  check (requester <> addressee)
);
create unique index if not exists friendships_pair_key on public.friendships (least(requester, addressee), greatest(requester, addressee));
create index if not exists friendships_addressee_idx on public.friendships (addressee);

alter table public.friendships enable row level security;
drop policy if exists "see own friendships" on public.friendships;
create policy "see own friendships" on public.friendships for select to authenticated
  using ((select auth.uid()) in (requester, addressee));
drop policy if exists "remove own friendships" on public.friendships;
create policy "remove own friendships" on public.friendships for delete to authenticated
  using ((select auth.uid()) in (requester, addressee));
-- Requests and accepting go through the functions below, which check the rules

-- Are two people friends?
create or replace function public.are_friends(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted' and least(f.requester, f.addressee) = least(a, b) and greatest(f.requester, f.addressee) = greatest(a, b)
  );
$$;
revoke all on function public.are_friends(uuid, uuid) from public, anon, authenticated;

-- Send a friend request by exact username. If they already asked you, this accepts it instead.
create or replace function public.request_friend(p_handle text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_them uuid;
  v_row public.friendships;
  v_recent integer;
begin
  if v_me is null then raise exception 'Sign in first'; end if;
  select id into v_them from public.profiles where handle = lower(trim(both '@' from trim(p_handle)));
  if v_them is null then raise exception 'No one has the username @%', lower(trim(both '@' from trim(p_handle))); end if;
  if v_them = v_me then raise exception 'That''s you'; end if;
  select * into v_row from public.friendships
    where least(requester, addressee) = least(v_me, v_them) and greatest(requester, addressee) = greatest(v_me, v_them);
  if found then
    if v_row.status = 'accepted' then return 'already_friends'; end if;
    if v_row.addressee = v_me then
      update public.friendships set status = 'accepted', accepted_at = now() where id = v_row.id;
      return 'accepted';
    end if;
    return 'already_requested';
  end if;
  select count(*) into v_recent from public.friendships where requester = v_me and created_at > now() - interval '1 day';
  if v_recent >= 30 then raise exception 'You''ve sent a lot of requests today. Try again tomorrow.'; end if;
  insert into public.friendships (requester, addressee) values (v_me, v_them);
  return 'requested';
end $$;
revoke all on function public.request_friend(text) from public, anon;
grant execute on function public.request_friend(text) to authenticated;

-- Accept a request someone sent you
create or replace function public.accept_friend(p_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.friendships set status = 'accepted', accepted_at = now()
  where id = p_id and addressee = auth.uid() and status = 'pending';
  if not found then raise exception 'That request isn''t waiting for you'; end if;
end $$;
revoke all on function public.accept_friend(bigint) from public, anon;
grant execute on function public.accept_friend(bigint) to authenticated;

-- Your friends and requests, with names (profiles stay private otherwise)
create or replace function public.get_my_friends()
returns table (friendship_id bigint, friend_id uuid, display_name text, handle text, status text, direction text, since timestamptz, ratings integer)
language sql stable security definer set search_path = '' as $$
  select f.id,
         case when f.requester = auth.uid() then f.addressee else f.requester end as other,
         p.display_name, p.handle, f.status,
         case when f.requester = auth.uid() then 'sent' else 'received' end,
         coalesce(f.accepted_at, f.created_at),
         case when f.status = 'accepted' then (select count(*)::integer from public.ratings r where r.user_id = p.id) else null end
  from public.friendships f
  join public.profiles p on p.id = case when f.requester = auth.uid() then f.addressee else f.requester end
  where auth.uid() in (f.requester, f.addressee)
  order by f.status, coalesce(f.accepted_at, f.created_at) desc;
$$;
revoke all on function public.get_my_friends() from public, anon;
grant execute on function public.get_my_friends() to authenticated;

-- A friend's ratings, for their list. Only works for accepted friends.
drop function if exists public.get_friend_ratings(uuid);
create or replace function public.get_friend_ratings(p_friend uuid)
returns table (place_id bigint, name text, category public.place_category, type text, city text, lat double precision, lon double precision, overall numeric, tags text[], updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select pl.id, pl.name, pl.category, pl.type, pl.city, pl.lat, pl.lon, r.overall, r.tags, r.updated_at
  from public.ratings r
  join public.places pl on pl.id = r.place_id and pl.status = 'approved'
  where r.user_id = p_friend and public.are_friends(auth.uid(), p_friend);
$$;
revoke all on function public.get_friend_ratings(uuid) from public, anon;
grant execute on function public.get_friend_ratings(uuid) to authenticated;

-- Which of your friends rated these places, and what they gave them
create or replace function public.get_friends_on_places(p_place_ids bigint[])
returns table (place_id bigint, friend_id uuid, display_name text, handle text, overall numeric)
language sql stable security definer set search_path = '' as $$
  select r.place_id, r.user_id, p.display_name, p.handle, r.overall
  from public.ratings r
  join public.profiles p on p.id = r.user_id
  where r.place_id = any (p_place_ids)
    and r.user_id <> auth.uid()
    and public.are_friends(auth.uid(), r.user_id);
$$;
revoke all on function public.get_friends_on_places(bigint[]) from public, anon;
grant execute on function public.get_friends_on_places(bigint[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Community details now include how many people gave each score (for the chart)
-- ---------------------------------------------------------------------------
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
    'dist', coalesce((select jsonb_object_agg(o, c) from (select (overall * 2)::int::text as o, count(*) as c from r group by 1) s), '{}'::jsonb),
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
