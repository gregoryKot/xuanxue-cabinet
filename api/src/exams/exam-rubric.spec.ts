import { DEFAULT_RUBRIC } from '@xuanxue/shared';
import { defaultRubric, mapRubric } from './exam-rubric';

describe('mapRubric', () => {
  it('undefined на входе — undefined, PATCH не трогает рубрику', () => {
    expect(mapRubric(undefined)).toBeUndefined();
  });

  it('критерий с id сохраняет его как есть', () => {
    const mapped = mapRubric([{ id: 'c1', title: 'Критерий', maxScore: 5 }]);

    expect(mapped).toEqual([
      { id: 'c1', title: 'Критерий', description: '', maxScore: 5 },
    ]);
  });

  it('критерий без id получает новый ObjectId', () => {
    const mapped = mapRubric([{ title: 'Критерий', maxScore: 5 }]);

    expect(mapped?.[0]?.id).toMatch(/^[0-9a-f]{24}$/);
  });

  it('description не прислали — пустая строка, не undefined', () => {
    const mapped = mapRubric([{ title: 'Критерий', maxScore: 5 }]);

    expect(mapped?.[0]?.description).toBe('');
  });
});

describe('defaultRubric', () => {
  it('содержит столько же критериев, сколько DEFAULT_RUBRIC, каждый со своим id', () => {
    const rubric = defaultRubric();

    expect(rubric).toHaveLength(DEFAULT_RUBRIC.length);
    const ids = rubric.map((criterion) => criterion.id);
    expect(new Set(ids).size).toBe(rubric.length); // все id разные
  });

  it('заголовки совпадают с DEFAULT_RUBRIC по порядку', () => {
    const rubric = defaultRubric();

    expect(rubric.map((criterion) => criterion.title)).toEqual(
      DEFAULT_RUBRIC.map((criterion) => criterion.title),
    );
  });

  it('два вызова подряд — разные id (не общая ссылка на одну копию)', () => {
    const first = defaultRubric();
    const second = defaultRubric();

    expect(first[0]?.id).not.toBe(second[0]?.id);
  });
});
