/**
 * Inserts f_auto,q_auto transformations into a Cloudinary URL.
 * f_auto → serves WebP/AVIF depending on browser support
 * q_auto → auto quality (reduces size 30-40% with no visible loss)
 *
 * Input:  https://res.cloudinary.com/xxx/image/upload/v123/folder/img.jpg
 * Output: https://res.cloudinary.com/xxx/image/upload/f_auto,q_auto/v123/folder/img.jpg
 */
export function cloudinaryUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (!url.includes("res.cloudinary.com")) return url;
  // Avoid double-inserting transformations
  if (url.includes("f_auto") || url.includes("q_auto")) return url;
  return url.replace("/upload/", "/upload/f_auto,q_auto/");
}
