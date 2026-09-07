import { describe, expect, it } from 'vitest';
import { formatChannelTestResult } from './formatChannelTestResult';

describe('formatChannelTestResult', () => {
  it('sent — доставлен', () => {
    expect(formatChannelTestResult({ status: 'sent' })).toBe('Тест доставлен');
  });

  it('manual — просит отправить самостоятельно', () => {
    expect(formatChannelTestResult({ status: 'manual' })).toMatch(/сами/);
  });

  it('failed с error — текст сервера', () => {
    expect(formatChannelTestResult({ status: 'failed', error: 'Бот не в группе' })).toBe(
      'Не доставлен: Бот не в группе',
    );
  });

  it('failed без error — общий текст', () => {
    expect(formatChannelTestResult({ status: 'failed' })).toBe('Не доставлен');
  });
});
