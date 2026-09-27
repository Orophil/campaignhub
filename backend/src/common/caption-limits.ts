import { Platform } from './enums';

/** Maximum caption length per platform (in characters / Unicode code points). */
export const CAPTION_LIMITS: Record<Platform, number> = {
  [Platform.X]: 280,
  [Platform.INSTAGRAM]: 2200,
  [Platform.LINKEDIN]: 3000,
  [Platform.FACEBOOK]: 5000,
};

/**
 * Counts characters the way a user perceives them for our purposes: by Unicode
 * code point, so an emoji such as "🚀" counts as 1 rather than 2 UTF-16 units.
 * The frontend counter uses the exact same function.
 */
export function captionLength(caption: string): number {
  return Array.from(caption).length;
}

/** Returns a human-readable error, or null when the caption fits the platform. */
export function validateCaption(platform: Platform, caption: string): string | null {
  const limit = CAPTION_LIMITS[platform];
  const length = captionLength(caption);
  if (length > limit) {
    return `Caption is ${length} characters but ${platform} allows at most ${limit} (${length - limit} over).`;
  }
  return null;
}
