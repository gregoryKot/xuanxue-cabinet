import { describe, expect, it } from 'vitest';
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
import { personContactLine } from './personContactLine';

// formatDateTime без явного пояса читает системный (lib/formatDate.ts) —
// пояс зрителя фиксируем, а не полагаемся на пояс машины (CLAUDE.md
// «Детерминизм»).
stubViewerTimeZone();

describe('personContactLine', () => {
  it('Telegram и дата входа — через точку', () => {
    expect(
      personContactLine({ hasTelegram: true, lastLoginAt: '2026-09-01T10:00:00Z' }),
    ).toBe('Telegram · Вход Вт, 1 сентября, 13:00');
  });

  it('без Telegram — без метода, только время: неизвестно, почта это или Google', () => {
    expect(
      personContactLine({ hasTelegram: false, lastLoginAt: '2026-09-01T10:00:00Z' }),
    ).toBe('Вход Вт, 1 сентября, 13:00');
  });

  it('ни разу не входил — «Ещё не входил»', () => {
    expect(personContactLine({ hasTelegram: false, lastLoginAt: undefined })).toBe(
      'Ещё не входил',
    );
  });

  it('Telegram, но ни разу не входил — метод остаётся перед подписью', () => {
    expect(personContactLine({ hasTelegram: true, lastLoginAt: undefined })).toBe(
      'Telegram · Ещё не входил',
    );
  });
});
