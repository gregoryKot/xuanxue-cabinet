// DTO-лимиты POST /exam-items вызванные без HTTP (ТЗ 4б.3, docs/PLAN.md
// §12) — бот прогоняет тот же CreateExamItemDto, не пишет свою проверку.
import { EXAM_ITEM_LIMITS } from '@xuanxue/shared';
import { validateExamItemDraftInput } from './exam-item-draft-validate';

describe('validateExamItemDraftInput', () => {
  it('валидный частичный ввод (только formulировка на шаге 2) — null', async () => {
    expect(
      await validateExamItemDraftInput({ kind: 'text', prompt: 'Опишите форму' }),
    ).toBeNull();
  });

  it('формулировка длиннее лимита — та же ошибка, что у POST /exam-items', async () => {
    const errors = await validateExamItemDraftInput({
      kind: 'text',
      prompt: 'а'.repeat(EXAM_ITEM_LIMITS.prompt + 1),
    });
    expect(errors).toEqual(['Формулировка: не длиннее 2000 символов.']);
  });

  it('пустая формулировка — «заполните поле»', async () => {
    const errors = await validateExamItemDraftInput({ kind: 'text', prompt: '' });
    expect(errors).toEqual(['Формулировка: заполните поле.']);
  });

  it('вариантов больше лимита — ошибка массива, не переизобретённая', async () => {
    const options = Array.from({ length: EXAM_ITEM_LIMITS.optionsMax + 1 }, (_, i) => ({
      text: `Вариант ${i}`,
      correct: false,
    }));
    const errors = await validateExamItemDraftInput({
      kind: 'multiple',
      prompt: 'Вопрос?',
      options,
    });
    expect(errors).toEqual(['Варианты ответа: не больше 10 элементов.']);
  });

  it('текст варианта длиннее лимита — путь до конкретного варианта', async () => {
    const errors = await validateExamItemDraftInput({
      kind: 'single',
      prompt: 'Вопрос?',
      options: [{ text: 'а'.repeat(EXAM_ITEM_LIMITS.optionText + 1), correct: true }],
    });
    expect(errors).toEqual(['Вариант 1, Текст: не длиннее 300 символов.']);
  });

  it('критерии не заданы (шаг «Пропустить») — не ошибка', async () => {
    expect(
      await validateExamItemDraftInput({ kind: 'text', prompt: 'Вопрос?' }),
    ).toBeNull();
  });

  it('неизвестное поле (whitelist) отбрасывается молча, не падает 400', async () => {
    expect(
      await validateExamItemDraftInput({
        kind: 'text',
        prompt: 'Вопрос?',
        // @ts-expect-error — проверяем именно нежданное поле снаружи контракта
        lishnee: 'x',
      }),
    ).toBeNull();
  });
});
