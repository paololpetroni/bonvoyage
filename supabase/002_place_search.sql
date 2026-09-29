-- Bonvoyage database update 002: add places from search, list places in any city
-- Run once in Supabase: SQL Editor > New query > paste this whole file > Run. Safe to re-run.

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
