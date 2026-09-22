// Тесты кэша промисов первого экрана (см. комментарий-«зачем» в
// prefetchCache.ts). Пути в каждом тесте свои — записи разных тестов не
// пересекаются в общем модульном `Map`, отдельной очистки между тестами не
// нужно (по образцу http.test.ts, где vi.stubGlobal сбрасывается в afterEach,
// а здесь сбрасывать нечего).
import { describe, expect, it } from 'vitest';
import { PREFETCH_TTL_MS, putPrefetched, takePrefetched } from './prefetchCache';

describe('putPrefetched / takePrefetched', () => {
  it('положенный промис возвращается один раз, повторно — null', () => {
    const promise = Promise.resolve({ ok: true });
    putPrefetched('/lessons?limit=1', promise);

    expect(takePrefetched('/lessons?limit=1')).toBe(promise);
    expect(takePrefetched('/lessons?limit=1')).toBeNull();
  });

  it('без записи под этим путём — null', () => {
    expect(takePrefetched('/nothing-here')).toBeNull();
  });

  it('просроченная запись не отдаётся — время инъекцией, а не системными часами', () => {
    const start = 1_000;
    putPrefetched('/classes?limit=1', Promise.resolve([]), () => start);

    // Ровно на границе срок ещё не истёк (< в реализации, не <=).
    expect(
      takePrefetched('/classes?limit=1', () => start + PREFETCH_TTL_MS),
    ).not.toBeNull();
  });

  it('запись, взятая после истечения TTL — null', () => {
    const start = 1_000;
    putPrefetched('/exams?limit=1', Promise.resolve([]), () => start);

    expect(
      takePrefetched('/exams?limit=1', () => start + PREFETCH_TTL_MS + 1),
    ).toBeNull();
  });

  it('отказ промиса, который никто не забрал, не всплывает как unhandledrejection', async () => {
    // Настоящую защиту даёт vitest: он роняет прогон на неперехваченный
    // отказ (см. комментарий в prefetchCache.ts про catch на копии промиса,
    // а не на сохранённой записи). Утверждение рядом — «запись не бросает
    // сама»: раньше проверкой считался только зелёный прогон, а молчаливое
    // «ничего не случилось» неотличимо от теста, который перестал что-либо
    // делать (гейт check-test-assertions.mjs, аудит 2026-09-22).
    expect(() =>
      putPrefetched('/broken', Promise.reject(new Error('сеть недоступна'))),
    ).not.toThrow();

    await Promise.resolve();
    await Promise.resolve();
  });

  it('без явного now — работают системные часы (ветка по умолчанию)', () => {
    putPrefetched('/channels?limit=1', Promise.resolve([]));

    expect(takePrefetched('/channels?limit=1')).not.toBeNull();
  });
});
