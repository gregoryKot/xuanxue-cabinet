import { describe, expect, it } from 'vitest';
import { TAG_LIMITS } from '@xuanxue/shared';
import { longTagError } from './longTagError';

describe('longTagError', () => {
  it('пустая строка — null', () => {
    expect(longTagError('')).toBeNull();
  });

  it('теги в пределах лимита — null', () => {
    expect(longTagError('ян, база')).toBeNull();
  });

  it('тег ровно в лимит символов — null', () => {
    const tag = 'а'.repeat(TAG_LIMITS.length);
    expect(longTagError(tag)).toBeNull();
  });

  it('тег на символ длиннее лимита — сообщение с этим тегом', () => {
    const longTag = 'а'.repeat(TAG_LIMITS.length + 1);
    expect(longTagError(longTag)).toBe(
      `Тег «${longTag}» длиннее ${TAG_LIMITS.length} символов. Сократите его.`,
    );
  });

  it('несколько длинных тегов — называется первый', () => {
    const first = 'а'.repeat(TAG_LIMITS.length + 1);
    const second = 'б'.repeat(TAG_LIMITS.length + 2);
    expect(longTagError(`ян, ${first}, ${second}`)).toBe(
      `Тег «${first}» длиннее ${TAG_LIMITS.length} символов. Сократите его.`,
    );
  });
});
