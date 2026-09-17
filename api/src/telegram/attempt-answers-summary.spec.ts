// Чистая логика, без Mongo и DI (CLAUDE.md «Тесты»).
import type {
  AttemptReviewBlockDto,
  AttemptReviewQuestionDto,
  ExamMediaDto,
} from '@xuanxue/shared';
import { attemptAnswersSummary } from './attempt-answers-summary';

function question(
  overrides: Partial<AttemptReviewQuestionDto>,
): AttemptReviewQuestionDto {
  return {
    itemId: 'i1',
    kind: 'text',
    prompt: 'Вопрос',
    options: [],
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
      blocks([question({ answerText: 'Короткий ответ' })]),
      [],
    );

    expect(text).toContain('Короткий ответ');
    expect(text).not.toContain('кабинете');
  });

  it('текст длиннее лимита — честная обрезка со ссылкой на кабинет', () => {
    const longText = 'а'.repeat(250);
    const text = attemptAnswersSummary(
      blocks([question({ answerText: longText })]),
      [],
      'https://xuanxue.su/grading/507f1f77bcf86cd799439011',
    );

    expect(text).toContain(
      'Полностью — в кабинете: https://xuanxue.su/grading/507f1f77bcf86cd799439011',
    );
    expect(text).not.toContain(longText);
  });

  it('текст без ответа — «Ответа нет.», не пустая строка', () => {
    const text = attemptAnswersSummary(blocks([question({})]), []);

    expect(text).toContain('Ответа нет.');
  });

  it('текст длиннее лимита, без PUBLIC_URL — обрезка без ссылки, не «undefined»', () => {
    const longText = 'а'.repeat(250);
    const text = attemptAnswersSummary(blocks([question({ answerText: longText })]), []);

    expect(text).toContain('… Полностью — в кабинете.');
    expect(text).not.toContain('undefined');
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

  it('видео получено через бота — напоминание, что оно уже переслано в чат', () => {
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

    expect(text).toContain('переслано вам в этом чате');
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
