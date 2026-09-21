// Сверка реестров со схемами Mongoose (CLAUDE.md, раздел «Данные», чеклист
// новой коллекции; ADR-0010): забытая модель или забытая ссылка на
// пользователя падает здесь, а не обнаруживается инцидентом на проде.
import { MODEL_DEFINITIONS } from '../common/model.registry';
import { UserRecord } from './user.schema';
import {
  USER_MODEL_NAME,
  USER_OWNED_CASCADES,
  USER_OWNED_COLLECTIONS,
  USER_REFERENCE_PATHS,
} from './user-data.registry';

describe('USER_MODEL_NAME', () => {
  it('совпадает с UserRecord.name — иначе USER_REFERENCE_PATHS сверяется не с той моделью', () => {
    expect(UserRecord.name).toBe(USER_MODEL_NAME);
  });
});

describe('USER_OWNED_COLLECTIONS', () => {
  it('модели с путём userId в схеме совпадают со списком реестра', () => {
    const withUserId = MODEL_DEFINITIONS.filter((def) =>
      Object.keys(def.schema.paths).includes('userId'),
    ).map((def) => def.name);

    expect(withUserId.sort()).toEqual([...USER_OWNED_COLLECTIONS].sort());
    for (const name of USER_OWNED_COLLECTIONS) {
      expect(MODEL_DEFINITIONS.some((def) => def.name === name)).toBe(true);
    }
  });
});

describe('USER_OWNED_CASCADES', () => {
  it('модели from/model из каждой записи существуют в MODEL_DEFINITIONS', () => {
    for (const { from, model } of USER_OWNED_CASCADES) {
      expect(MODEL_DEFINITIONS.some((def) => def.name === from)).toBe(true);
      expect(MODEL_DEFINITIONS.some((def) => def.name === model)).toBe(true);
    }
  });

  it('from обязан быть во владении (USER_OWNED_COLLECTIONS) — иначе каскад никогда не найдёт ids по userId', () => {
    for (const { from } of USER_OWNED_CASCADES) {
      expect((USER_OWNED_COLLECTIONS as readonly string[]).includes(from)).toBe(true);
    }
  });

  it('model НЕ во владении и в её схеме нет userId — иначе каскад лишний, цель и так уносится USER_OWNED_COLLECTIONS', () => {
    for (const { model } of USER_OWNED_CASCADES) {
      expect((USER_OWNED_COLLECTIONS as readonly string[]).includes(model)).toBe(false);
      const def = MODEL_DEFINITIONS.find((d) => d.name === model);
      expect(Object.keys(def?.schema.paths ?? {})).not.toContain('userId');
    }
  });

  it('path существует в схеме модели from — иначе каскад читает несуществующее поле', () => {
    for (const { from, path } of USER_OWNED_CASCADES) {
      const def = MODEL_DEFINITIONS.find((d) => d.name === from);
      expect(Object.keys(def?.schema.paths ?? {})).toContain(path);
    }
  });
});

describe('USER_REFERENCE_PATHS', () => {
  it('пути с ref: "User" в схемах совпадают со списком реестра', () => {
    const refPaths = MODEL_DEFINITIONS.flatMap((def) =>
      Object.entries(def.schema.paths)
        .filter(([, type]) => {
          // path.options типизирован как AnyObject (mongoose) — сужаем явно,
          // без этого eslint (no-unsafe-member-access) ругается на .ref.
          const { ref } = type.options as { ref?: string };
          return ref === USER_MODEL_NAME;
        })
        .map(([path]) => ({ model: def.name, path })),
    );

    const actual = refPaths.map(({ model, path }) => `${model}.${path}`).sort();
    const expected = USER_REFERENCE_PATHS.map(
      ({ model, path }) => `${model}.${path}`,
    ).sort();

    expect(actual).toEqual(expected);
  });
});
