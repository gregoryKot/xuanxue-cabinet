// Механизм правила 1д для выгрузки данных (ADR-0160): новая коллекция или
// новое поле не могут молча выпасть из ответа на «какие данные вы храните».
// Просроченный или неполный ответ по ст. 13 закона — иск до 10 000 ₪ без
// доказательства ущерба, поэтому дыру ищет тест, а не память автора.
// Тот же приём, что user-data.registry.spec.ts для удаления.
import { MODEL_DEFINITIONS } from '../common/model.registry';
import {
  USER_MODEL_NAME,
  USER_OWNED_CASCADES,
  USER_OWNED_COLLECTIONS,
  USER_REFERENCE_PATHS,
} from './user-data.registry';
import { USER_EXPORT_REFERENCES, USER_EXPORT_SECTIONS } from './user-export.registry';

// Решается одинаково для всех моделей и в списки поля не входит: владелец — сам
// человек (userId повторять в каждой записи незачем), id и метки времени
// выгрузка добавляет сама, `__v` — служебное поле Mongoose.
const COMMON_PATHS = new Set(['_id', '__v', 'userId', 'createdAt', 'updatedAt']);

function schemaPaths(model: string): string[] {
  const def = MODEL_DEFINITIONS.find((d) => d.name === model);
  return Object.keys(def?.schema.paths ?? {}).filter((path) => !COMMON_PATHS.has(path));
}

describe('USER_EXPORT_SECTIONS', () => {
  it('секции — ровно те модели, по которым идёт удаление: аккаунт, владение, цели каскадов', () => {
    const expected = [
      USER_MODEL_NAME,
      ...USER_OWNED_COLLECTIONS,
      ...USER_OWNED_CASCADES.map((cascade) => cascade.model),
    ];
    expect(Object.keys(USER_EXPORT_SECTIONS).sort()).toEqual([...expected].sort());
  });

  for (const model of Object.keys(USER_EXPORT_SECTIONS)) {
    describe(model, () => {
      const spec = USER_EXPORT_SECTIONS[model as keyof typeof USER_EXPORT_SECTIONS];

      it('у каждого поля схемы есть решение: входит в выгрузку или не входит с причиной', () => {
        const decided = [...spec.include, ...Object.keys(spec.omit)].sort();
        expect(decided).toEqual(schemaPaths(model).sort());
      });

      it('поле не бывает одновременно в include и omit', () => {
        const both = spec.include.filter((field) => field in spec.omit);
        expect(both).toEqual([]);
      });

      it('у каждого пропущенного поля причина непустая', () => {
        const empty = Object.entries(spec.omit)
          .filter(([, reason]) => reason.trim() === '')
          .map(([field]) => field);
        expect(empty).toEqual([]);
      });

      it('название и срок хранения написаны — человек читает их в файле', () => {
        expect(spec.title.trim()).not.toBe('');
        expect(spec.retention.trim()).not.toBe('');
      });
    });
  }

  // Ключи верных ответов лежат в снимке формы внутри попытки, а выгрузку могут
  // переслать самому ученику, который потом сдаёт те же формы повторно.
  it('снимок формы в попытке уходит без ключа верных ответов', () => {
    const refine = USER_EXPORT_SECTIONS.ExamAttemptRecord.refine;
    const refined = refine?.({
      blocks: [
        {
          id: 'b1',
          title: 'Блок',
          required: true,
          questions: [
            {
              itemId: 'q1',
              version: 1,
              kind: 'single',
              prompt: 'Вопрос?',
              options: [{ id: 'o1', text: 'Да', correct: true }],
            },
          ],
        },
      ],
    });

    expect(JSON.stringify(refined)).not.toContain('correct');
    expect(JSON.stringify(refined)).toContain('Вопрос?');
  });
});

describe('USER_EXPORT_REFERENCES', () => {
  it('совпадают с USER_REFERENCE_PATHS: удаление обнуляет ровно те же ссылки, что выгрузка пересчитывает', () => {
    const key = (ref: { model: string; path: string }): string =>
      `${ref.model}.${ref.path}`;
    expect(USER_EXPORT_REFERENCES.map(key).sort()).toEqual(
      USER_REFERENCE_PATHS.map(key).sort(),
    );
  });

  it('у каждой ссылки своё непустое название — иначе два счётчика в файле не различить', () => {
    const titles = USER_EXPORT_REFERENCES.map((ref) => ref.title);
    expect(titles.every((title) => title.trim() !== '')).toBe(true);
    expect(new Set(titles).size).toBe(titles.length);
  });
});
