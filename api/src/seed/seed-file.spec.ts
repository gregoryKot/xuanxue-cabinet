// Юнит-тест чистой логики разбора и валидации сида (без Mongo, CLAUDE.md
// «Тесты»: чистая логика — юнит-тест без Mongo и без DI).
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSeedFile, validateSeedClasses } from './seed-file';

const EXAMPLE_PATH = join(__dirname, '..', '..', 'seed', 'classes.example.json');

describe('parseSeedFile', () => {
  it('пример из api/seed/classes.example.json валиден', () => {
    const text = readFileSync(EXAMPLE_PATH, 'utf8');
    const seed = parseSeedFile(text);

    expect(validateSeedClasses(seed).errors).toEqual([]);
  });

  it('подставляет tz файла классу без своего tz', () => {
    const seed = parseSeedFile(
      JSON.stringify({
        tz: 'Asia/Jerusalem',
        classes: [{ title: 'А', format: 'online' }],
      }),
    );

    expect((seed.classes[0] as { tz?: string })?.tz).toBe('Asia/Jerusalem');
  });

  it('не трогает tz класса, если он указан явно', () => {
    const seed = parseSeedFile(
      JSON.stringify({
        tz: 'Asia/Jerusalem',
        classes: [{ title: 'А', format: 'online', tz: 'Europe/Moscow' }],
      }),
    );

    expect((seed.classes[0] as { tz?: string })?.tz).toBe('Europe/Moscow');
  });

  it('битый JSON — ошибка с понятным текстом и ссылкой на образец', () => {
    expect(() => parseSeedFile('{ не json')).toThrow('не валидный JSON');
    expect(() => parseSeedFile('{ не json')).toThrow('classes.example.json');
  });

  it('без поля tz — ошибка', () => {
    expect(() => parseSeedFile(JSON.stringify({ classes: [] }))).toThrow('"tz"');
  });

  it('classes не массив — ошибка', () => {
    expect(() =>
      parseSeedFile(JSON.stringify({ tz: 'Asia/Jerusalem', classes: {} })),
    ).toThrow('"classes"');
  });

  it('classes: [null] — не бросает TypeError на подстановке tz', () => {
    expect(() =>
      parseSeedFile(JSON.stringify({ tz: 'Asia/Jerusalem', classes: [null] })),
    ).not.toThrow();
  });
});

describe('validateSeedClasses', () => {
  it('битое время "25:00" — ошибка с путём classes[0].rules[0].time', () => {
    const seed = parseSeedFile(
      JSON.stringify({
        tz: 'Asia/Jerusalem',
        classes: [
          {
            title: 'Тайцзицюань',
            format: 'online',
            rules: [{ weekday: 1, time: '25:00', durationMin: 60 }],
          },
        ],
      }),
    );

    const { errors } = validateSeedClasses(seed);

    expect(errors).toContainEqual(
      expect.objectContaining({ path: 'classes[0].rules[0].time' }),
    );
  });

  it('без обязательного title — ошибка с путём classes[0].title', () => {
    const seed = parseSeedFile(
      JSON.stringify({ tz: 'Asia/Jerusalem', classes: [{ format: 'online' }] }),
    );

    const { errors } = validateSeedClasses(seed);

    expect(errors.some((e) => e.path === 'classes[0].title')).toBe(true);
  });

  it('валидные классы — пустой список ошибок', () => {
    const seed = parseSeedFile(
      JSON.stringify({
        tz: 'Asia/Jerusalem',
        classes: [{ title: 'Тайцзицюань', format: 'online' }],
      }),
    );

    expect(validateSeedClasses(seed).errors).toEqual([]);
  });

  it('title обрезан пробелами, лишнее поле "_id" в результат не попадает', () => {
    const seed = parseSeedFile(
      JSON.stringify({
        tz: 'Asia/Jerusalem',
        classes: [{ _id: 'ignored', title: '  Тайцзицюань  ', format: 'online' }],
      }),
    );

    const { errors, classes } = validateSeedClasses(seed);

    expect(errors).toEqual([]);
    expect(classes[0]?.title).toBe('Тайцзицюань');
    expect((classes[0] as unknown as Record<string, unknown>)._id).toBeUndefined();
  });

  it('дубль (title, groupLabel) внутри файла — ошибка на второй записи', () => {
    const seed = parseSeedFile(
      JSON.stringify({
        tz: 'Asia/Jerusalem',
        classes: [
          { title: 'Цзибеньгун', groupLabel: 'средняя группа', format: 'online' },
          { title: 'Цзибеньгун', groupLabel: 'средняя группа', format: 'online' },
        ],
      }),
    );

    const { errors } = validateSeedClasses(seed);

    expect(errors).toContainEqual(expect.objectContaining({ path: 'classes[1].title' }));
  });

  it('одинаковый title с разной группой — не дубль, ошибок нет', () => {
    const seed = parseSeedFile(
      JSON.stringify({
        tz: 'Asia/Jerusalem',
        classes: [
          { title: 'Цзибеньгун', groupLabel: 'средняя группа', format: 'online' },
          { title: 'Цзибеньгун', groupLabel: 'начинающие', format: 'online' },
        ],
      }),
    );

    expect(validateSeedClasses(seed).errors).toEqual([]);
  });

  it('classes[N] не объект (null) — понятная ошибка, не TypeError', () => {
    const seed = parseSeedFile(JSON.stringify({ tz: 'Asia/Jerusalem', classes: [null] }));

    expect(() => validateSeedClasses(seed)).not.toThrow();
    const { errors } = validateSeedClasses(seed);
    const error = errors.find((e) => e.path === 'classes[0]');
    expect(error?.message).toContain('объект');
  });
});
