// Чистая логика, без Mongo и без Telegram (CLAUDE.md «Тесты»): экран
// «Экзамены» — кнопка «Начать»/«Продолжить»/«Начать ещё раз» или честный
// текст без кнопки. Само правило, когда какая кнопка, проверяет
// shared/src/my-exams.spec.ts (getMyExamAction) — здесь только то, что
// принадлежит боту: подписи кнопок и текст причины.
import type { MyExamDto } from '@xuanxue/shared';
import { buildExamListScreen } from './exam-list-screen';

function exam(overrides: Partial<MyExamDto> = {}): MyExamDto {
  return {
    id: '507f1f77bcf86cd799439011',
    title: 'Форма третьего уровня',
    description: '',
    level: '',
    attemptsAllowed: 1,
    attemptsUsed: 0,
    ...overrides,
  };
}

describe('buildExamListScreen', () => {
  it('пустой список — честное «пока нечего сдавать»', () => {
    const menu = buildExamListScreen([]);
    expect(menu.text).toBe('Пока нечего сдавать.');
    expect(menu.buttons).toEqual(
      [{ text: 'В меню', callback_data: 'menu:back' }].map((b) => [b]),
    );
  });

  it('ещё не начата — кнопка «Начать»', () => {
    const menu = buildExamListScreen([exam()]);
    expect(menu.text).toContain('Форма третьего уровня');
    expect(menu.buttons[0]).toEqual([
      {
        text: 'Начать: Форма третьего уровня',
        callback_data: 'exam:507f1f77bcf86cd799439011',
      },
    ]);
  });

  it('попытка в работе — кнопка «Продолжить», не «Начать»', () => {
    const menu = buildExamListScreen([
      exam({
        attemptsUsed: 1,
        lastAttempt: { id: 'a1', status: 'in_progress', expired: false },
      }),
    ]);
    expect(menu.buttons[0]?.[0]?.text).toBe('Продолжить: Форма третьего уровня');
  });

  // Решение владельца 2026-09-21 (ADR-0091): сдал сам и ждёт проверки — вторая
  // попытка была бы обходом проверки, кнопки быть не должно, даже если лимит
  // попыток формы это разрешает. До этого решения бот путал `status:
  // 'submitted'` с «можно начать заново» и давал кнопку независимо от того,
  // кто закрыл попытку — эта ветка ловит именно тот баг.
  it('сдана вручную, есть ещё попытки — кнопки нет, «Сдано, ждёт проверки.»', () => {
    const menu = buildExamListScreen([
      exam({
        attemptsAllowed: 2,
        attemptsUsed: 1,
        lastAttempt: { id: 'a1', status: 'submitted', expired: false },
      }),
    ]);
    expect(menu.text).toContain('Сдано, ждёт проверки.');
    expect(menu.buttons).toHaveLength(1); // только «В меню»
  });

  it('попытку закрыло время, есть ещё попытки — «Начать ещё раз»', () => {
    const menu = buildExamListScreen([
      exam({
        attemptsAllowed: 2,
        attemptsUsed: 1,
        lastAttempt: { id: 'a1', status: 'submitted', expired: true },
      }),
    ]);
    expect(menu.buttons[0]?.[0]?.text).toBe('Начать ещё раз: Форма третьего уровня');
  });

  it('сдана, попыток больше нет — «Сдано, ждёт проверки», без кнопки', () => {
    const menu = buildExamListScreen([
      exam({
        attemptsUsed: 1,
        lastAttempt: { id: 'a1', status: 'submitted', expired: false },
      }),
    ]);
    expect(menu.text).toContain('Сдано, ждёт проверки.');
    expect(menu.buttons).toHaveLength(1); // только «В меню»
  });

  it('проверена, попыток больше нет — «Использованы все попытки», без кнопки', () => {
    const menu = buildExamListScreen([
      exam({
        attemptsUsed: 1,
        lastAttempt: { id: 'a1', status: 'graded', expired: false, outcome: 'passed' },
      }),
    ]);
    expect(menu.text).toContain('Использованы все попытки — 1 из 1.');
    expect(menu.buttons).toHaveLength(1);
  });

  it('уровень формы показан рядом с названием', () => {
    const menu = buildExamListScreen([exam({ level: 'третий уровень' })]);
    expect(menu.text).toContain('Форма третьего уровня (третий уровень)');
  });

  it('длинное название формы обрезается только в кнопке, не в тексте', () => {
    const longTitle = 'О'.repeat(80);
    const menu = buildExamListScreen([exam({ title: longTitle })]);
    expect(menu.text).toContain(longTitle);
    const buttonText = menu.buttons[0]?.[0]?.text ?? '';
    expect(buttonText.length).toBeLessThan(longTitle.length);
    expect(buttonText).toContain('…');
  });

  it('несколько форм — по строке и кнопке на каждую, «В меню» в конце', () => {
    const menu = buildExamListScreen([
      exam({ id: 'e1', title: 'Первая' }),
      exam({
        id: 'e2',
        title: 'Вторая',
        attemptsUsed: 1,
        lastAttempt: { id: 'a1', status: 'submitted', expired: false },
      }),
    ]);
    expect(menu.buttons).toHaveLength(2); // «Начать: Первая» + «В меню» (у второй кнопки нет)
    expect(menu.buttons[menu.buttons.length - 1]).toEqual([
      { text: 'В меню', callback_data: 'menu:back' },
    ]);
  });
});
