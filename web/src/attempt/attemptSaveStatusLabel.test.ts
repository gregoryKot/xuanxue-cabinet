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

  // Аудит 2026-10-01, F44: отказ навсегда — текст сервера, без обещания повтора.
  it('refused — текст сервера как есть', () => {
    expect(formatSaveStatus('refused', 'Доступ закрыт.')).toBe('Доступ закрыт.');
  });

  it('refused без текста — короткий факт без обещания повтора', () => {
    expect(formatSaveStatus('refused')).toBe('Не сохранилось');
  });
});
