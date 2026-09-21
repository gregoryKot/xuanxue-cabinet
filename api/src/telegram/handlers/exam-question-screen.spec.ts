// Чистая логика, без Mongo и без Telegram (CLAUDE.md «Тесты»): сборка экрана
// вопроса — заголовок «Вопрос N из M», разметка кнопок, отметка выбранного,
// навигация «Назад»/«Дальше»/«Сдать».
import {
  ATTEMPT_EXPIRED_MESSAGE,
  ATTEMPT_NOT_IN_PROGRESS_MESSAGE,
} from '@xuanxue/shared';
import type { AttemptQuestionDto, ExamAttemptDto } from '@xuanxue/shared';
import {
  buildFinishedScreen,
  buildQuestionScreen,
  flattenAttemptQuestions,
} from './exam-question-screen';

const ATTEMPT_ID = '507f1f77bcf86cd799439011';

function question(overrides: Partial<AttemptQuestionDto> = {}): AttemptQuestionDto {
  return {
    itemId: 'i1',
    version: 1,
    kind: 'single',
    prompt: 'Сколько форм в третьем уровне?',
    options: [
      { id: 'o1', text: 'Три' },
      { id: 'o2', text: 'Пять' },
    ],
    ...overrides,
  };
}

function attempt(
  questions: AttemptQuestionDto[],
  overrides: Partial<ExamAttemptDto> = {},
): ExamAttemptDto {
  return {
    id: ATTEMPT_ID,
    examId: 'e1',
    examTitle: 'Форма третьего уровня',
    userId: 'u1',
    status: 'in_progress',
    blocks: [{ id: 'b1', title: 'Теория', questions }],
    answers: [],
    startedAt: '2026-09-12T10:00:00.000Z',
    expired: false,
    ...overrides,
  };
}

describe('flattenAttemptQuestions', () => {
  it('склеивает вопросы всех блоков по порядку', () => {
    const q1 = question({ itemId: 'i1' });
    const q2 = question({ itemId: 'i2' });
    const a: ExamAttemptDto = {
      ...attempt([q1]),
      blocks: [
        { id: 'b1', title: 'Теория', questions: [q1] },
        { id: 'b2', title: 'Практика', questions: [q2] },
      ],
    };
    expect(flattenAttemptQuestions(a).map((q) => q.itemId)).toEqual(['i1', 'i2']);
  });
});

describe('buildQuestionScreen', () => {
  it('заголовок «Вопрос N из M», формулировка и подсказка', () => {
    const q = question({ hint: 'Подумайте про блоки' });
    const view = buildQuestionScreen(attempt([q, question({ itemId: 'i2' })]), 0);
    expect(view.text).toContain('Вопрос 1 из 2');
    expect(view.text).toContain('Сколько форм в третьем уровне?');
    expect(view.text).toContain('Подумайте про блоки');
  });

  it('single — по кнопке на вариант, без отметки, если ещё не отвечено', () => {
    const view = buildQuestionScreen(attempt([question()]), 0);
    expect(view.buttons[0]).toEqual([
      { text: 'Три', callback_data: `eo:${ATTEMPT_ID}:0:0` },
    ]);
    expect(view.buttons[1]).toEqual([
      { text: 'Пять', callback_data: `eo:${ATTEMPT_ID}:0:1` },
    ]);
  });

  // ADR-0037: вариант-картинка без подписи — Telegram отклоняет кнопку с
  // пустым текстом, поэтому кнопка подписана номером.
  it('single — вариант без текста (картинка без подписи) подписан номером', () => {
    const q = question({
      options: [
        { id: 'o1', text: '', imageId: 'img1' },
        { id: 'o2', text: 'Пять' },
      ],
    });
    const view = buildQuestionScreen(attempt([q]), 0);
    expect(view.buttons[0]?.[0]?.text).toBe('Вариант 1');
    expect(view.buttons[1]?.[0]?.text).toBe('Пять');
  });

  it('single — выбранный вариант отмечен галочкой', () => {
    const view = buildQuestionScreen(
      attempt([question()], { answers: [{ itemId: 'i1', optionIds: ['o2'] }] }),
      0,
    );
    expect(view.buttons[0]?.[0]?.text).toBe('Три');
    expect(view.buttons[1]?.[0]?.text).toBe('✓ Пять');
  });

  it('multiple — переключатели ☐/☑ по выбранным вариантам', () => {
    const q = question({ kind: 'multiple' });
    const view = buildQuestionScreen(
      attempt([q], { answers: [{ itemId: 'i1', optionIds: ['o1'] }] }),
      0,
    );
    expect(view.buttons[0]?.[0]?.text).toBe('☑ Три');
    expect(view.buttons[1]?.[0]?.text).toBe('☐ Пять');
  });

  it('text — просит написать ответ сообщением, без кнопок-вариантов', () => {
    const q = question({ kind: 'text', options: [] });
    const view = buildQuestionScreen(attempt([q]), 0);
    expect(view.text).toContain('Напишите ответ сообщением');
    // Только навигация («Сдать» — единственный вопрос, последний).
    expect(view.buttons).toEqual([
      [{ text: 'Сдать', callback_data: `es:${ATTEMPT_ID}` }],
    ]);
  });

  it('text — уже отвечен: эхо сохранённого текста, не повторная просьба', () => {
    const q = question({ kind: 'text', options: [] });
    const view = buildQuestionScreen(
      attempt([q], { answers: [{ itemId: 'i1', text: 'Мой ответ' }] }),
      0,
    );
    expect(view.text).toContain('Ваш ответ: «Мой ответ»');
    expect(view.text).not.toContain('Напишите ответ сообщением');
  });

  it('video — просит прислать видео, без кнопок-вариантов', () => {
    const q = question({ kind: 'video', options: [] });
    const view = buildQuestionScreen(attempt([q]), 0);
    expect(view.text).toContain('Снимите или пришлите видео сюда');
  });

  it('video — уже привязано (media с itemId этого вопроса) — «видео получено»', () => {
    const q = question({ kind: 'video', options: [] });
    const view = buildQuestionScreen(
      attempt([q], {
        media: [
          {
            id: 'm1',
            attemptId: ATTEMPT_ID,
            itemId: q.itemId,
            kind: 'telegram',
            receivedAt: '2026-09-12T10:00:00.000Z',
          },
        ],
      }),
      0,
    );
    expect(view.text).toContain('Видео получено.');
    // Замены нет — второе видео ложится рядом (media-asset.schema.ts), и
    // текст обещает ровно это, а не «заменит».
    expect(view.text).toContain('учитель увидит оба');
    expect(view.text).not.toContain('заменит');
    expect(view.text).not.toContain('Снимите или пришлите видео сюда');
  });

  // ADR-0037: видео другого вопроса не подсвечивает этот — раньше «хоть
  // какое-то видео у попытки» путало два video-вопроса одной формы.
  it('video — есть видео другого вопроса — просит прислать, не «получено»', () => {
    const q = question({ kind: 'video', options: [] });
    const view = buildQuestionScreen(
      attempt([q, question({ itemId: 'другой-вопрос', kind: 'video', options: [] })], {
        media: [
          {
            id: 'm1',
            attemptId: ATTEMPT_ID,
            itemId: 'другой-вопрос',
            kind: 'telegram',
            receivedAt: '2026-09-12T10:00:00.000Z',
          },
        ],
      }),
      0,
    );
    expect(view.text).toContain('Снимите или пришлите видео сюда');
    expect(view.text).not.toContain('Видео получено.');
  });

  it('первый вопрос — нет «Назад», есть «Дальше»', () => {
    const view = buildQuestionScreen(
      attempt([question(), question({ itemId: 'i2' })]),
      0,
    );
    const nav = view.buttons[view.buttons.length - 1] ?? [];
    expect(nav.map((b) => b.text)).toEqual(['Дальше']);
  });

  it('средний вопрос — «Назад» и «Дальше»', () => {
    const view = buildQuestionScreen(
      attempt([question(), question({ itemId: 'i2' }), question({ itemId: 'i3' })]),
      1,
    );
    const nav = view.buttons[view.buttons.length - 1] ?? [];
    expect(nav.map((b) => b.text)).toEqual(['Назад', 'Дальше']);
  });

  it('последний вопрос — «Назад» и «Сдать», не «Дальше»', () => {
    const view = buildQuestionScreen(
      attempt([question(), question({ itemId: 'i2' })]),
      1,
    );
    const nav = view.buttons[view.buttons.length - 1] ?? [];
    expect(nav.map((b) => b.text)).toEqual(['Назад', 'Сдать']);
    expect(nav[1]).toEqual({ text: 'Сдать', callback_data: `es:${ATTEMPT_ID}` });
  });

  it('индекс вне снимка — защита в глубину, без кнопок-вариантов', () => {
    const view = buildQuestionScreen(attempt([question()]), 5);
    expect(view.text).toBe('Форма третьего уровня');
  });
});

describe('buildFinishedScreen', () => {
  it('время вышло — ATTEMPT_EXPIRED_MESSAGE', () => {
    const view = buildFinishedScreen(attempt([question()], { expired: true }), false);
    expect(view.text).toBe(ATTEMPT_EXPIRED_MESSAGE);
  });

  it('только что сдана — текст про отправку, не про повтор', () => {
    const view = buildFinishedScreen(
      attempt([question()], { status: 'submitted' }),
      true,
    );
    expect(view.text).toBe('Работа отправлена. Учитель проверит и пришлёт результат.');
  });

  it('уже была сдана раньше — ATTEMPT_NOT_IN_PROGRESS_MESSAGE', () => {
    const view = buildFinishedScreen(
      attempt([question()], { status: 'submitted' }),
      false,
    );
    expect(view.text).toBe(ATTEMPT_NOT_IN_PROGRESS_MESSAGE);
  });
});
