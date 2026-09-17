import { describe, expect, it } from 'vitest';
import { formatSaveStatus } from './attemptSaveStatusLabel';

describe('formatSaveStatus', () => {
  it('idle — строки нет, сохранять ещё нечего', () => {
    expect(formatSaveStatus('idle')).toBeNull();
  });

  it('saving', () => {
    expect(formatSaveStatus('saving')).toBe('Сохраняем…');
  });

  it('saved', () => {
    expect(formatSaveStatus('saved')).toBe('Сохранено');
  });

  it('error — обещание повтора, не просьба нажать кнопку', () => {
    expect(formatSaveStatus('error')).toBe('Не сохранилось — попробуем ещё раз');
  });
});
