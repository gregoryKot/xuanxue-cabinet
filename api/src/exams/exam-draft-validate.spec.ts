// DTO-лимиты POST /exams вызванные без HTTP (ТЗ 4б.4, docs/PLAN.md §12) —
// бот прогоняет тот же CreateExamDto, не пишет свою проверку.
import { EXAM_LIMITS } from '@xuanxue/shared';
import { validateExamDraftInput } from './exam-draft-validate';

describe('validateExamDraftInput', () => {
  it('валидный частичный ввод (только название на своём шаге) — null', async () => {
    expect(await validateExamDraftInput({ title: 'Экзамен по форме' })).toBeNull();
  });

  it('пустое название — «заполните поле»', async () => {
    expect(await validateExamDraftInput({ title: '' })).toEqual([
      'Название: заполните поле.',
    ]);
  });

  it('название длиннее лимита — та же ошибка, что у POST /exams', async () => {
    const errors = await validateExamDraftInput({
      title: 'а'.repeat(EXAM_LIMITS.title + 1),
    });
    expect(errors).toEqual(['Название: не длиннее 200 символов.']);
  });

  it('лимит времени вне диапазона — ошибка того же поля, что у формы кабинета', async () => {
    const errors = await validateExamDraftInput({
      title: 'Экзамен',
      timeLimitMin: EXAM_LIMITS.timeLimitMinMax + 1,
    });
    expect(errors).toEqual(['Лимит времени: не больше 600.']);
  });

  it('число попыток вне диапазона — ошибка того же поля', async () => {
    const errors = await validateExamDraftInput({
      title: 'Экзамен',
      attemptsAllowed: EXAM_LIMITS.attemptsMax + 1,
    });
    expect(errors).toEqual(['Число попыток: не больше 10.']);
  });

  it('вопросов в блоке больше лимита — ошибка массива, не переизобретённая', async () => {
    const itemIds = Array.from(
      { length: EXAM_LIMITS.itemsPerBlockMax + 1 },
      () => '507f1f77bcf86cd799439011',
    );
    const errors = await validateExamDraftInput({
      title: 'Экзамен',
      blocks: [{ itemIds }],
    });
    // Число — из самой константы: предел вырос до 100 под первый настоящий
    // экзамен школы (ADR-0064), и тест проверяет границу, а не литерал.
    expect(errors).toEqual([
      `Блок 1, Вопросы: не больше ${EXAM_LIMITS.itemsPerBlockMax} элементов.`,
    ]);
  });

  it('лимит времени не задан (шаг «без лимита») — не ошибка', async () => {
    expect(
      await validateExamDraftInput({ title: 'Экзамен', blocks: [{ itemIds: [] }] }),
    ).toBeNull();
  });

  it('неизвестное поле (whitelist) отбрасывается молча, не падает 400', async () => {
    expect(
      await validateExamDraftInput({
        title: 'Экзамен',
        // @ts-expect-error — проверяем именно нежданное поле снаружи контракта
        lishnee: 'x',
      }),
    ).toBeNull();
  });
});
