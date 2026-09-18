// Юнит-тест чистой функции toBotSessionLean (CLAUDE.md «Тесты», уровень
// «чистая логика» — без Mongo и без DI): расшифровка draft*/build*-полей
// (ТЗ 4б.3/4б.4) и дефолт draftOptions: [] когда вариантов пока нет — тот же
// набор случаев, что раньше проверялся только через bot-session.service.spec.ts
// (там и остался, read-after-write через настоящую Mongo).
import { Types } from 'mongoose';
import { encrypt, encryptJson } from '../utils/encryption';
import { toBotSessionLean, type RawBotSessionLean } from './bot-session.lean';

describe('toBotSessionLean', () => {
  it('расшифровывает draftPrompt/draftCriteria/draftOptions черновика вопроса', () => {
    const draftPrompt = encrypt('Сколько форм в третьем уровне?') ?? undefined;
    const draftCriteria = encrypt('Смотрим стойку') ?? undefined;
    const draftOptions = encryptJson([{ text: 'Три', correct: true }]) ?? undefined;
    // Шифротекст не совпадает с исходным текстом — иначе тест ничего не
    // проверял бы (encrypt мог бы тихо не сработать).
    expect(draftPrompt).not.toContain('форм');
    const raw: RawBotSessionLean = {
      kind: 'examItemDraft',
      draftStep: 'confirm',
      draftKind: 'single',
      draftPrompt,
      draftCriteria,
      draftOptions,
    };

    const session = toBotSessionLean(raw);

    expect(session.draftPrompt).toBe('Сколько форм в третьем уровне?');
    expect(session.draftCriteria).toBe('Смотрим стойку');
    expect(session.draftOptions).toEqual([{ text: 'Три', correct: true }]);
  });

  it('draftOptions — пустой массив, а не undefined, когда вариантов пока нет', () => {
    const raw: RawBotSessionLean = { kind: 'examItemDraft', draftStep: 'prompt' };

    const session = toBotSessionLean(raw);

    expect(session.draftOptions).toEqual([]);
  });

  it('расшифровывает buildTitle черновика сборки экзамена', () => {
    const itemId = new Types.ObjectId();
    const buildTitle = encrypt('Экзамен по форме') ?? undefined;
    expect(buildTitle).not.toContain('Экзамен');
    const raw: RawBotSessionLean = {
      kind: 'examBuildDraft',
      buildStep: 'confirm',
      buildItemIds: [itemId],
      buildTitle,
    };

    const session = toBotSessionLean(raw);

    expect(session.buildTitle).toBe('Экзамен по форме');
    // build*-поля вне шифрования переносятся как есть.
    expect(session.buildItemIds).toEqual([itemId]);
  });

  it('buildTitle отсутствует до своего шага — undefined, не пустая строка', () => {
    const raw: RawBotSessionLean = { kind: 'examBuildDraft', buildStep: 'pick' };

    const session = toBotSessionLean(raw);

    expect(session.buildTitle).toBeUndefined();
  });

  it('поля вне draft*/build* переносятся без изменений (kind, lessonId)', () => {
    const lessonId = new Types.ObjectId();
    const raw: RawBotSessionLean = { kind: 'topic', lessonId };

    const session = toBotSessionLean(raw);

    expect(session.kind).toBe('topic');
    expect(session.lessonId).toBe(lessonId);
  });
});
