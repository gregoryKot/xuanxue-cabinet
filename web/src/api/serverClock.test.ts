import { afterEach, describe, expect, it, vi } from 'vitest';
import { noteServerDate, resetServerClock, serverNow } from './serverClock';

afterEach(() => {
  resetServerClock();
  vi.useRealTimers();
});

describe('serverClock', () => {
  it('без единого ответа — часы устройства как есть', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-02T10:00:00Z'));
    expect(serverNow()).toBe(Date.parse('2026-10-02T10:00:00Z'));
  });

  // Часы телефона спешат на 3 минуты: сервер говорит 10:00, телефон — 10:03.
  it('заголовок Date позади часов устройства — serverNow отстаёт на тот же сдвиг', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-02T10:03:00Z'));
    noteServerDate('Fri, 02 Oct 2026 10:00:00 GMT', Date.now());

    expect(serverNow()).toBe(Date.parse('2026-10-02T10:00:00Z'));

    vi.advanceTimersByTime(30_000);
    expect(serverNow()).toBe(Date.parse('2026-10-02T10:00:30Z'));
  });

  it('часы телефона отстают — serverNow опережает их', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-02T09:55:00Z'));
    noteServerDate('Fri, 02 Oct 2026 10:00:00 GMT', Date.now());

    expect(serverNow()).toBe(Date.parse('2026-10-02T10:00:00Z'));
  });

  it('нет заголовка или он не дата — прежний сдвиг остаётся', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-02T10:03:00Z'));
    noteServerDate('Fri, 02 Oct 2026 10:00:00 GMT', Date.now());

    noteServerDate(null, Date.now());
    noteServerDate('не дата', Date.now());

    expect(serverNow()).toBe(Date.parse('2026-10-02T10:00:00Z'));
  });

  it('следующий ответ переписывает сдвиг — часы не копят ошибку', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-02T10:03:00Z'));
    noteServerDate('Fri, 02 Oct 2026 10:00:00 GMT', Date.now());
    noteServerDate('Fri, 02 Oct 2026 10:03:00 GMT', Date.now());

    expect(serverNow()).toBe(Date.now());
  });
});
