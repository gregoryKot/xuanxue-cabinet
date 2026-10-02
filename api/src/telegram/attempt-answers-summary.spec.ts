// Чистая логика, без Mongo и DI (CLAUDE.md «Тесты»).
import type {
  AttemptReviewBlockDto,
  AttemptReviewQuestionDto,
  ExamMediaDto,
} from '@xuanxue/shared';
import { attemptAnswersSummary } from './attempt-answers-summary';

// Без переопределения — вопрос без ответа (CLAUDE.md: фикстура — не «true
// везде, лишь бы собралось»); тесты на отвеченный вопрос сами добавляют
// answered: true рядом с optionsCheck/answerText.
function question(
  overrides: Partial<AttemptReviewQuestionDto>,
): AttemptReviewQuestionDto {
  return {
    itemId: 'i1',
    kind: 'text',
    prompt: 'Вопрос',
    options: [],
    answered: false,
    ...overrides,
  };
}

function blocks(questions: AttemptReviewQuestionDto[]): AttemptReviewBlockDto[] {
  return [{ id: 'b1', title: 'Блок', questions }];
}

// Ветка «вариант» решает по question.options.length (не по kind напрямую) —
// у настоящего single/multiple вопроса варианты всегда есть, здесь достаточно
// заглушки без содержательных полей: тест смотрит на optionsCheck, не на неё.
const SOME_OPTION = [{ id: 'o1', text: 'A', correct: true, selected: true }];

describe('attemptAnswersSummary', () => {
  it('вариант — «верно k из n», без лишних слов про баллы (ADR-0038)', () => {
    const text = attemptAnswersSummary(
      blocks([
        question({
          kind: 'single',
          options: SOME_OPTION,
          answered: true,
          optionsCheck: {
            correctSelectedCount: 2,
            correctTotalCount: 3,
            incorrectSelectedCount: 0,
          },
        }),
      ]),
      [],
    );

    expect(text).toContain('Верно 2 из 3.');
  });

  it('вариант — упоминает лишние выбранные, когда они есть', () => {
    const text = attemptAnswersSummary(
      blocks([
        question({
          kind: 'multiple',
          options: SOME_OPTION,
          answered: true,
          optionsCheck: {
            correctSelectedCount: 1,
            correctTotalCount: 2,
            incorrectSelectedCount: 1,
          },
        }),
      ]),
      [],
    );

    expect(text).toContain('лишних выбрано 1');
  });

  it('текст короче лимита — идёт как есть, без обрезки', () => {
    const text = attemptAnswersSummary(
      blocks([question({ answerText: 'Короткий ответ', answered: true })]),
      [],
    );

    expect(text).toContain('Короткий ответ');
    expect(text).not.toContain('кабинете');
  });

  // Ссылка сюда не печатается ни разу: при нескольких длинных ответах в одной
  // попытке она повторялась бы столько же раз — она одна, в подвале
  // attempt-submitted-message.ts (отзыв владельца 2026-09-22).
  it('текст длиннее лимита — честная обрезка, без ссылки и без «undefined»', () => {
    const longText = 'а'.repeat(250);
    const text = attemptAnswersSummary(
      blocks([question({ answerText: longText, answered: true })]),
      [],
    );

    expect(text).toContain('… Полностью — в кабинете.');
    expect(text).not.toContain(longText);
    expect(text).not.toContain('undefined');
    expect(text).not.toContain('http');
  });

  it('текст без ответа — «Ответа нет.», не пустая строка', () => {
    const text = attemptAnswersSummary(blocks([question({})]), []);

    expect(text).toContain('Ответа нет.');
  });

  it('вариант без автопроверки (защита в глубину) — «Ответа нет.»', () => {
    const text = attemptAnswersSummary(
      blocks([question({ kind: 'single', options: SOME_OPTION })]),
      [],
    );

    expect(text).toContain('Ответа нет.');
  });

  it('видео-«сирота» без itemId (деплой на стыке) — не привязывается к вопросу', () => {
    const media: ExamMediaDto[] = [
      {
        id: 'm1',
        attemptId: 'a1',
        kind: 'telegram',
        receivedAt: '2026-09-17T00:00:00Z',
      },
    ];
    const text = attemptAnswersSummary(blocks([question({ kind: 'video' })]), media);

    expect(text).toContain('Видео не получено.');
  });

  it('видео получено через бота — факт получения, без обещания «уже переслано»', () => {
    const media: ExamMediaDto[] = [
      {
        id: 'm1',
        attemptId: 'a1',
        itemId: 'i1',
        kind: 'telegram',
        receivedAt: '2026-09-17T00:00:00Z',
      },
    ];
    const text = attemptAnswersSummary(blocks([question({ kind: 'video' })]), media);

    expect(text).toContain('Видео получено.');
    expect(text).not.toContain('переслано');
  });

  it('видео по ссылке — сама ссылка в тексте', () => {
    const media: ExamMediaDto[] = [
      {
        id: 'm1',
        attemptId: 'a1',
        itemId: 'i1',
        kind: 'link',
        url: 'https://example.com/video.mp4',
        receivedAt: '2026-09-17T00:00:00Z',
      },
    ];
    const text = attemptAnswersSummary(blocks([question({ kind: 'video' })]), media);

    expect(text).toContain('https://example.com/video.mp4');
  });

  // ADR-0137: файл в R2 — ссылки на него в боте нет, только факт «в кабинете».
  it('видео файлом (ADR-0137) — «видео в кабинете», не «отмечено вручную»', () => {
    const media: ExamMediaDto[] = [
      {
        id: 'm1',
        attemptId: 'a1',
        itemId: 'i1',
        kind: 'file',
        answerVideoId: 'v1',
        receivedAt: '2026-09-17T00:00:00Z',
      },
    ];
    const text = attemptAnswersSummary(blocks([question({ kind: 'video' })]), media);

    expect(text).toContain('в кабинете');
    expect(text).not.toContain('Отмечено вручную');
  });

  it('видео не получено — честный текст, не тишина', () => {
    const text = attemptAnswersSummary(blocks([question({ kind: 'video' })]), []);

    expect(text).toContain('Видео не получено.');
  });

  it('видео отмечено вручную с подписью — подпись в тексте', () => {
    const media: ExamMediaDto[] = [
      {
        id: 'm1',
        attemptId: 'a1',
        itemId: 'i1',
        kind: 'manual',
        note: 'Прислал в личку',
        receivedAt: '2026-09-17T00:00:00Z',
      },
    ];
    const text = attemptAnswersSummary(blocks([question({ kind: 'video' })]), media);

    expect(text).toContain('Отмечено вручную: Прислал в личку');
  });

  it('видео отмечено вручную без подписи — честный текст, не «undefined»', () => {
    const media: ExamMediaDto[] = [
      {
        id: 'm1',
        attemptId: 'a1',
        itemId: 'i1',
        kind: 'manual',
        receivedAt: '2026-09-17T00:00:00Z',
      },
    ];
    const text = attemptAnswersSummary(blocks([question({ kind: 'video' })]), media);

    expect(text).toContain('Отмечено вручную, без комментария.');
  });
});

// Аудит 2026-10-01 (F31): «Форма 1» на 56 вопросов давала 4087–4279 знаков,
// Telegram отвергал сообщение целиком, и учитель не получал «работу сдали».
describe('attemptAnswersSummary — бюджет длины', () => {
  const many = Array.from({ length: 60 }, (_, i) =>
    question({
      itemId: `i${i}`,
      kind: 'single',
      prompt: `Вопрос номер ${i + 1} про стойку и дыхание в движении формы`,
      options: SOME_OPTION,
      answered: true,
      optionsCheck: {
        correctSelectedCount: 1,
        correctTotalCount: 1,
        incorrectSelectedCount: 0,
      },
    }),
  );

  it('без бюджета — все вопросы, как раньше', () => {
    const text = attemptAnswersSummary(blocks(many), []);
    expect(text).toContain('60. Вопрос номер 60');
    expect(text).not.toContain('Остальные ответы');
  });

  it('не влезает — первые вопросы целиком и честная строка про остальные, длина в бюджете', () => {
    const text = attemptAnswersSummary(blocks(many), [], 1000);

    expect(text.length).toBeLessThanOrEqual(1000);
    expect(text).toContain('1. Вопрос номер 1');
    expect(text).toMatch(/Остальные ответы \(ещё \d+\) — в кабинете\.$/);
    const shown = (text.match(/^\d+\. Вопрос/gm) ?? []).length;
    const rest = Number(/ещё (\d+)/.exec(text)?.[1]);
    expect(shown + rest).toBe(60);
    expect(text).not.toContain(`${shown + 1}. Вопрос`);
  });

  it('влезает ровно — без строки про остальные', () => {
    const two = many.slice(0, 2);
    const full = attemptAnswersSummary(blocks(two), []);
    expect(attemptAnswersSummary(blocks(two), [], full.length)).toBe(full);
  });
});
