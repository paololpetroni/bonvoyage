-- Bonvoyage database update 003: ratings
-- Run once in Supabase: SQL Editor > New query > paste this whole file > Run. Safe to re-run.

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
