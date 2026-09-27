import { CAPTION_LIMITS, captionLength, validateCaption } from '../src/common/caption-limits';
import { Platform } from '../src/common/enums';

describe('caption limits per platform', () => {
  it('matches the brief', () => {
    expect(CAPTION_LIMITS).toEqual({ X: 280, INSTAGRAM: 2200, LINKEDIN: 3000, FACEBOOK: 5000 });
  });

  it.each(Object.entries(CAPTION_LIMITS) as [Platform, number][])('%s accepts %i characters and rejects one more', (platform, limit) => {
    expect(validateCaption(platform, 'a'.repeat(limit))).toBeNull();
    expect(validateCaption(platform, 'a'.repeat(limit + 1))).toBe(
      `Caption is ${limit + 1} characters but ${platform} allows at most ${limit} (1 over).`,
    );
  });

  it('counts emoji as one character', () => {
    expect('🚀'.length).toBe(2);
    expect(captionLength('🚀')).toBe(1);
    expect(validateCaption(Platform.X, '🚀'.repeat(280))).toBeNull();
  });
});
