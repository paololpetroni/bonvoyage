-- Bonvoyage database update 004: labelled photos
-- Run once in Supabase: SQL Editor > New query > paste this whole file > Run. Safe to re-run.

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
