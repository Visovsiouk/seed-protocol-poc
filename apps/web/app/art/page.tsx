/**
 * Dev-only art gallery — `/art`.
 *
 * Every generated visual, laid out so the whole set can be judged in one
 * screenshot instead of one combat encounter at a time. This is where "all my
 * wisps look identical" and "the glyph vanishes on the cyberpunk background"
 * get caught, which is why it exists before the art is wired into real screens.
 *
 * Not shipped: the route 404s outside development.
 */

import { notFound } from "next/navigation";
import { ArtGallery } from "./ArtGallery";

export const metadata = { title: "Art gallery (dev)" };

export default function ArtGalleryPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ArtGallery />;
}
