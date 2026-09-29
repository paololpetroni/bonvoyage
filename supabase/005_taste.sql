-- Bonvoyage database update 005: taste profiles and "Best for you"
-- Run once in Supabase: SQL Editor > New query > paste this whole file > Run. Safe to re-run.

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
