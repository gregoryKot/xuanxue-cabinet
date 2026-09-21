// Тест хранилища «вышла новая версия» (ADR-0099). Состояние живёт в closure
// модуля (без экспорта функции сброса только для тестов — knip уронил бы CI
// на экспорт без рантайм-импортёра), поэтому каждый тест берёт свежий модуль
// через vi.resetModules() + динамический import(), тот же приём, что в
// errors/reportClientError.test.ts.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as AppVersionModule from './appVersion';

let noteAppVersion: typeof AppVersionModule.noteAppVersion;
let hasNewAppVersion: typeof AppVersionModule.hasNewAppVersion;
let subscribeToAppVersion: typeof AppVersionModule.subscribeToAppVersion;

beforeEach(async () => {
  vi.resetModules();
  ({ noteAppVersion, hasNewAppVersion, subscribeToAppVersion } =
    await import('./appVersion'));
});

describe('appVersion', () => {
  it('первая версия запоминается молча — флаг не поднимается', () => {
    noteAppVersion('sha-a');

    expect(hasNewAppVersion()).toBe(false);
  });

  it('та же версия второй раз — флаг не поднимается, подписчик не дёргается', () => {
    const listener = vi.fn();
    noteAppVersion('sha-a');
    subscribeToAppVersion(listener);

    noteAppVersion('sha-a');

    expect(hasNewAppVersion()).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it('другая версия поднимает флаг и уведомляет подписчика', () => {
    const listener = vi.fn();
    noteAppVersion('sha-a');
    subscribeToAppVersion(listener);

    noteAppVersion('sha-b');

    expect(hasNewAppVersion()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  // При выкатке инстансы Railway отвечают вперемешку старым и новым SHA —
  // строка баннера не должна мигать туда-обратно (ADR-0099).
  it('возврат прежней версии флаг не гасит', () => {
    noteAppVersion('sha-a');
    noteAppVersion('sha-b');

    noteAppVersion('sha-a');

    expect(hasNewAppVersion()).toBe(true);
  });

  it('null (заголовка нет — локальная разработка) игнорируется', () => {
    noteAppVersion('sha-a');

    noteAppVersion(null);

    expect(hasNewAppVersion()).toBe(false);
  });

  it('отписка останавливает уведомления', () => {
    const listener = vi.fn();
    noteAppVersion('sha-a');
    const unsubscribe = subscribeToAppVersion(listener);
    unsubscribe();

    noteAppVersion('sha-b');

    expect(listener).not.toHaveBeenCalled();
  });
});
