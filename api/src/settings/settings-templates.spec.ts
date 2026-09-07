import { InvalidInputError } from '../common/errors';
import { assertKnownPlaceholders, templatesSetFrom } from './settings-templates';

describe('assertKnownPlaceholders', () => {
  it('только известные плейсхолдеры — не бросает', () => {
    expect(() =>
      assertKnownPlaceholders({ lesson_link: 'Через {минут} минут {название}' }),
    ).not.toThrow();
  });

  it('{ведущий} — разрешён (allow-list)', () => {
    expect(() => assertKnownPlaceholders({ recording: 'Ведёт {ведущий}' })).not.toThrow();
  });

  it('неизвестный плейсхолдер — InvalidInputError с именем и списком доступных', () => {
    expect(() => assertKnownPlaceholders({ recording: 'Вела {фамилия}' })).toThrow(
      InvalidInputError,
    );
    try {
      assertKnownPlaceholders({ recording: 'Вела {фамилия}' });
    } catch (err) {
      expect((err as Error).message).toContain('{фамилия}');
      expect((err as Error).message).toContain('Доступные');
    }
  });

  it('шаблон не передан (undefined) — пропускается, не бросает', () => {
    expect(() => assertKnownPlaceholders({})).not.toThrow();
  });

  it('один шаблон передан, другой явно undefined — второй пропускается', () => {
    expect(() =>
      assertKnownPlaceholders({ lesson_link: '{название}', recording: undefined }),
    ).not.toThrow();
  });
});

describe('templatesSetFrom', () => {
  it('оба поля — оба ключа схемы', () => {
    expect(templatesSetFrom({ lesson_link: 'ссылка', recording: 'запись' })).toEqual({
      'templates.lessonLink': 'ссылка',
      'templates.recording': 'запись',
    });
  });

  it('только один — только его ключ', () => {
    expect(templatesSetFrom({ recording: 'запись' })).toEqual({
      'templates.recording': 'запись',
    });
  });

  it('пусто — пустой $set', () => {
    expect(templatesSetFrom({})).toEqual({});
  });
});
