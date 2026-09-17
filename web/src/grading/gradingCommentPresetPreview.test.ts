import { describe, expect, it } from 'vitest';
import { previewPresetText } from './gradingCommentPresetPreview';

describe('previewPresetText', () => {
  it('короткий текст возвращается как есть (после trim)', () => {
    expect(previewPresetText('  Держите центр  ')).toBe('Держите центр');
  });

  it('длинный текст обрезается с многоточием, не длиннее лимита', () => {
    const text = 'Очень длинный комментарий про стойку, дыхание и координацию рук';
    const preview = previewPresetText(text, 20);

    expect(preview.endsWith('…')).toBe(true);
    expect(preview.length).toBeLessThanOrEqual(21);
    expect(text.startsWith(preview.slice(0, -1))).toBe(true);
  });

  it('обрезка не оставляет висящий пробел перед многоточием', () => {
    expect(previewPresetText('Раз два три четыре пять', 12)).toBe('Раз два три…');
  });

  it('текст ровно на границе длины — без многоточия', () => {
    expect(previewPresetText('1234567890', 10)).toBe('1234567890');
  });
});
