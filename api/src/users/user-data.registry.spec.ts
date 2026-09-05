// Сверка реестров со схемами Mongoose (CLAUDE.md, раздел «Данные», чеклист
// новой коллекции; ADR-0010): забытая модель или забытая ссылка на
// пользователя падает здесь, а не обнаруживается инцидентом на проде.
import { MODEL_DEFINITIONS } from '../common/model.registry';
import {
  USER_MODEL_NAME,
  USER_OWNED_COLLECTIONS,
  USER_REFERENCE_PATHS,
} from './user-data.registry';

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
