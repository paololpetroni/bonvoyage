import { photoUrl } from "../lib/photos.js";
import Icon from "./Icon.jsx";

// A place's cover: its best photo, or a colourful tile with the category icon when nobody has added one yet
export default function Cover({ photo, category, name, className = "" }) {
  if (photo) {
    return (
      <div className={`cover ${className}`}>
        <img src={photoUrl(photo.path)} alt={`${name}`} loading="lazy" />
      </div>
    );
  }
  return (
    <div className={`cover placeholder cat-${category} ${className}`} aria-hidden="true">
      <Icon name={category} size={34} />
    </div>
  );
}
