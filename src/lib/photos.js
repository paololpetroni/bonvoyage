import { supabase } from "./supabase.js";

export const BUCKET = "place-photos";
const MAX_SIDE = 1600;
const QUALITY = 0.82;

// Shrink a photo in the browser before upload: at most 1600 px on the long side, saved as JPEG.
// Re-drawing the image also strips hidden metadata like the GPS location where it was taken.
export async function compressImage(file) {
  if (!file.type.startsWith("image/")) throw new Error(`${file.name} isn't a photo.`);
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(`${file.name} couldn't be read. iPhone HEIC photos may need to be saved as JPEG first.`);
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale), height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", QUALITY));
  if (!blob) throw new Error(`${file.name} couldn't be converted.`);
  return { blob, width, height };
}

export const photoUrl = (path) => supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

// Upload one photo into a slot (Main, Room, Drinks...) and record it. If recording fails, the file is removed again.
export async function uploadPhoto({ placeId, userId, slot, file }) {
  const { blob, width, height } = await compressImage(file);
  const path = `${placeId}/${userId}/${slot}-${crypto.randomUUID()}.jpg`;
  const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
  if (up.error) throw new Error(up.error.message);
  const { error } = await supabase.from("place_photos").insert({ place_id: placeId, user_id: userId, slot, path, width, height });
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw new Error(error.message.includes("duplicate key") ? "You already have a photo there. Remove it first." : error.message);
  }
  return path;
}

export async function deletePhoto(photo) {
  const { error } = await supabase.storage.from(BUCKET).remove([photo.path]);
  if (error) throw new Error(error.message);
  const { error: err2 } = await supabase.from("place_photos").delete().eq("id", photo.id);
  if (err2) throw new Error(err2.message);
}

// Remove every photo file a person uploaded (used before deleting their account)
export async function deleteAllMyPhotos(userId) {
  const { data } = await supabase.from("place_photos").select("path").eq("user_id", userId);
  const paths = (data || []).map((p) => p.path);
  for (let i = 0; i < paths.length; i += 100) await supabase.storage.from(BUCKET).remove(paths.slice(i, i + 100));
}
