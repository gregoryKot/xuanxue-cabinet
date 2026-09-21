// Барабан — публичная поверхность `@xuanxue/shared`, её импортируют 877 файлов
// `api` и `web`, а своего теста у неё не было. Что барабан состоит только из
// `export … from`, статически проверяет scripts/check-shared-exports.mjs
// (ADR-0081); здесь — что импорт действительно отдаёт имена, а не дыры.
//
// Побочное следствие, важное для порога покрытия: этот импорт — единственное
// место, где выполняются модули `shared` без логики (`exams.ts`, `materials.ts`
// и соседние — одни константы и типы). Без него они считаются непокрытыми, и
// порог vitest-храповика для shared падает с 99% до 68%.
import { describe, expect, it } from 'vitest';

import * as shared from './index';

describe('барабан shared', () => {
  it('отдаёт публичную поверхность пакета', () => {
    expect(Object.keys(shared).length).toBeGreaterThan(0);
  });

  it('не отдаёт undefined ни под одним именем', () => {
    const holes = Object.entries(shared)
      .filter(([, value]) => value === undefined)
      .map(([name]) => name);
    expect(holes).toEqual([]);
  });
});
