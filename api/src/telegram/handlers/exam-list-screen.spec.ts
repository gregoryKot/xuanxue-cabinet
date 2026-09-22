// Чистая логика, без Mongo и без Telegram (CLAUDE.md «Тесты»): экран
// «Экзамены» — кнопка «Начать»/«Продолжить»/«Начать ещё раз» или честный
// текст без кнопки. Само правило, когда какая кнопка, проверяет
// shared/src/my-exams.spec.ts (getMyExamAction) — здесь только то, что
// принадлежит боту: подписи кнопок и текст причины.
import type { MyExamDto } from '@xuanxue/shared';
import { CONTINUE_QUESTION_INDEX } from './exam-callback-ids';
import { buildExamListScreen } from './exam-list-screen';

// Момент «сейчас» фиксированный (CLAUDE.md «Детерминизм»), не Date.now().
const NOW_MS = Date.parse('2026-09-22T16:00:00Z');

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
    const menu = buildExamListScreen([], NOW_MS);
    expect(menu.text).toBe('Пока нечего сдавать.');
    expect(menu.buttons).toEqual(
      [{ text: 'В меню', callback_data: 'menu:back' }].map((b) => [b]),
    );
  });

  it('ещё не начата — кнопка «Начать»', () => {
    const menu = buildExamListScreen([exam()], NOW_MS);
    expect(menu.text).toContain('Форма третьего уровня');
    expect(menu.buttons[0]).toEqual([
      {
        text: 'Начать: Форма третьего уровня',
        callback_data: 'exam:507f1f77bcf86cd799439011',
      },
    ]);
  });

  // Регрессия (отзыв владельца 2026-09-22, ADR-0119): «Продолжить» несёт
  // attemptId, не examId — тот же callback, что «Начать»/«Начать ещё раз»,
  // вёл в ExamAttemptsService.start, который для уже отправленной попытки
  // заводит новую пустую и списывает её из лимита. Кнопка открывает
  // существующую попытку напрямую (`eq`, handleExamQuestion) с сентинелом
  // CONTINUE_QUESTION_INDEX — сам номер вопроса список не знает.
  it('попытка в работе — кнопка «Продолжить» несёт id попытки, не экзамена', () => {
    const menu = buildExamListScreen(
      [
        exam({
          attemptsUsed: 1,
          lastAttempt: { id: 'a1', status: 'in_progress', expired: false },
        }),
      ],
      NOW_MS,
    );
    expect(menu.buttons[0]?.[0]).toEqual({
      text: 'Продолжить: Форма третьего уровня',
      callback_data: `eq:a1:${CONTINUE_QUESTION_INDEX}`,
    });
  });

  // Решение владельца 2026-09-21 (ADR-0091): сдал сам и ждёт проверки — вторая
  // попытка была бы обходом проверки, кнопки быть не должно, даже если лимит
  // попыток формы это разрешает. До этого решения бот путал `status:
  // 'submitted'` с «можно начать заново» и давал кнопку независимо от того,
  // кто закрыл попытку — эта ветка ловит именно тот баг.
  it('сдана вручную, есть ещё попытки — кнопки нет, «Сдано, ждёт проверки.»', () => {
    const menu = buildExamListScreen(
      [
        exam({
          attemptsAllowed: 2,
          attemptsUsed: 1,
          lastAttempt: { id: 'a1', status: 'submitted', expired: false },
        }),
      ],
      NOW_MS,
    );
    expect(menu.text).toContain('Сдано, ждёт проверки.');
    expect(menu.buttons).toHaveLength(1); // только «В меню»
  });

  it('попытку закрыло время, есть ещё попытки — «Начать ещё раз», id экзамена, не попытки', () => {
    const menu = buildExamListScreen(
      [
        exam({
          id: 'e1',
          attemptsAllowed: 2,
          attemptsUsed: 1,
          lastAttempt: { id: 'a1', status: 'submitted', expired: true },
        }),
      ],
      NOW_MS,
    );
    expect(menu.buttons[0]?.[0]).toEqual({
      text: 'Начать ещё раз: Форма третьего уровня',
      callback_data: 'exam:e1',
    });
  });

  it('сдана, попыток больше нет — «Сдано, ждёт проверки», без кнопки', () => {
    const menu = buildExamListScreen(
      [
        exam({
          attemptsUsed: 1,
          lastAttempt: { id: 'a1', status: 'submitted', expired: false },
        }),
      ],
      NOW_MS,
    );
    expect(menu.text).toContain('Сдано, ждёт проверки.');
    expect(menu.buttons).toHaveLength(1); // только «В меню»
  });

  it('проверена, попыток больше нет — «Использованы все попытки», без кнопки', () => {
    const menu = buildExamListScreen(
      [
        exam({
          attemptsUsed: 1,
          lastAttempt: { id: 'a1', status: 'graded', expired: false, outcome: 'passed' },
        }),
      ],
      NOW_MS,
    );
    expect(menu.text).toContain('Использованы все попытки — 1 из 1.');
    expect(menu.buttons).toHaveLength(1);
  });

  it('уровень формы показан рядом с названием', () => {
    const menu = buildExamListScreen([exam({ level: 'третий уровень' })], NOW_MS);
    expect(menu.text).toContain('Форма третьего уровня (третий уровень)');
  });

  it('длинное название формы обрезается только в кнопке, не в тексте', () => {
    const longTitle = 'О'.repeat(80);
    const menu = buildExamListScreen([exam({ title: longTitle })], NOW_MS);
    expect(menu.text).toContain(longTitle);
    const buttonText = menu.buttons[0]?.[0]?.text ?? '';
    expect(buttonText.length).toBeLessThan(longTitle.length);
    expect(buttonText).toContain('…');
  });

  it('несколько форм — по строке и кнопке на каждую, «В меню» в конце', () => {
    const menu = buildExamListScreen(
      [
        exam({ id: 'e1', title: 'Первая' }),
        exam({
          id: 'e2',
          title: 'Вторая',
          attemptsUsed: 1,
          lastAttempt: { id: 'a1', status: 'submitted', expired: false },
        }),
      ],
      NOW_MS,
    );
    expect(menu.buttons).toHaveLength(2); // «Начать: Первая» + «В меню» (у второй кнопки нет)
    expect(menu.buttons[menu.buttons.length - 1]).toEqual([
      { text: 'В меню', callback_data: 'menu:back' },
    ]);
  });

  // Строка времени — describeExamTime (shared/src/exam-time.ts, ADR-0122),
  // бот своих слов про время не сочиняет; здесь только что она встала на
  // место между заголовком и причиной, и что пояс школы подписан всегда.
  it('форма с лимитом, попытки не было — «На попытку даётся 40 минут»', () => {
    const menu = buildExamListScreen([exam({ timeLimitMin: 40 })], NOW_MS);
    expect(menu.text).toContain('Форма третьего уровня\nНа попытку даётся 40 минут');
  });

  it('идёт попытка — «Осталось …, попытка закроется в … (Asia/Jerusalem)»', () => {
    const menu = buildExamListScreen(
      [
        exam({
          timeLimitMin: 40,
          attemptsUsed: 1,
          lastAttempt: {
            id: 'a1',
            status: 'in_progress',
            expired: false,
            deadlineAt: '2026-09-22T16:40:00.000Z',
          },
        }),
      ],
      NOW_MS,
    );
    expect(menu.text).toContain(
      'Осталось 40 мин, попытка закроется в 19:40 (Asia/Jerusalem)',
    );
  });

  it('форма без лимита времени — строки про время нет', () => {
    const menu = buildExamListScreen([exam()], NOW_MS);
    expect(menu.text).toBe('Экзамены:\n\nФорма третьего уровня');
  });
});

// Отзыв владельца 2026-09-22 (ADR-0121): кнопка формы с лимитом времени
// сперва задаёт вопрос, не стартует попытку сразу.
describe('buildExamListScreen — кнопка «exc» перед стартом с лимитом (ADR-0121)', () => {
  it('лимит есть, попытки не было («Начать») — кнопка ведёт на exc, не exam', () => {
    const menu = buildExamListScreen([exam({ timeLimitMin: 40 })], NOW_MS);
    expect(menu.buttons[0]?.[0]).toEqual({
      text: 'Начать: Форма третьего уровня',
      callback_data: 'exc:507f1f77bcf86cd799439011',
    });
  });

  it('лимит есть, время закрыло попытку («Начать ещё раз») — тоже exc', () => {
    const menu = buildExamListScreen(
      [
        exam({
          timeLimitMin: 40,
          attemptsAllowed: 2,
          attemptsUsed: 1,
          lastAttempt: { id: 'a1', status: 'submitted', expired: true },
        }),
      ],
      NOW_MS,
    );
    expect(menu.buttons[0]?.[0]).toEqual({
      text: 'Начать ещё раз: Форма третьего уровня',
      callback_data: 'exc:507f1f77bcf86cd799439011',
    });
  });

  // «Продолжить» подтверждения не получает ни при каком лимите: часы уже
  // тикают, вопрос запоздал бы. Кнопка ведёт прямо в свою попытку (`eq` с
  // CONTINUE_QUESTION_INDEX, ADR-0119) — ни `exc`, ни `exam`: через
  // `exam:<examId>` она заводила бы новую попытку вместо открытия старой.
  it('лимит есть, попытка уже идёт («Продолжить») — без вопроса, прямо в свою попытку', () => {
    const menu = buildExamListScreen(
      [
        exam({
          timeLimitMin: 40,
          attemptsUsed: 1,
          lastAttempt: { id: 'a1', status: 'in_progress', expired: false },
        }),
      ],
      NOW_MS,
    );
    expect(menu.buttons[0]?.[0]).toEqual({
      text: 'Продолжить: Форма третьего уровня',
      callback_data: `eq:a1:${CONTINUE_QUESTION_INDEX}`,
    });
  });

  it('лимита нет — кнопка сразу на exam, спрашивать нечего', () => {
    const menu = buildExamListScreen([exam()], NOW_MS);
    expect(menu.buttons[0]?.[0]).toEqual({
      text: 'Начать: Форма третьего уровня',
      callback_data: 'exam:507f1f77bcf86cd799439011',
    });
  });
});
