// Экраны шагов 'options'/'correct' (ТЗ 4б.3) — чистая логика.
import {
  correctWaitScreen,
  formatOptionsSummary,
  optionsWaitScreen,
} from './new-exam-item-options-screen';

describe('formatOptionsSummary', () => {
  it('нумерует варианты и отмечает верные', () => {
    expect(
      formatOptionsSummary([
        { text: 'A', correct: false },
        { text: 'B', correct: true },
      ]),
    ).toBe('Варианты:\n1. A\n2. B — верно');
  });
});

describe('optionsWaitScreen', () => {
  it('без вариантов — просит первый, без списка', () => {
    const screen = optionsWaitScreen([]);
    expect(screen.text).toContain('Пришлите первый вариант');
    expect(screen.buttons).toEqual([
      [{ text: 'Готово', callback_data: 'nqd:options' }],
      [{ text: 'Отмена', callback_data: 'nqf:cancel' }],
    ]);
  });

  it('с вариантами — список (без пересказа числа) и предложение продолжить или завершить', () => {
    const screen = optionsWaitScreen([{ text: 'A', correct: false }]);
    expect(screen.text).not.toContain('Добавлено вариантов');
    expect(screen.text).toContain('1. A');
    expect(screen.text).toContain('Готово');
  });
});

describe('correctWaitScreen', () => {
  it('single — кнопки по вариантам, без «Готово»', () => {
    const screen = correctWaitScreen('single', [
      { text: 'A', correct: false },
      { text: 'B', correct: true },
    ]);
    expect(screen.text).toBe('Какой вариант верный?');
    expect(screen.buttons).toEqual([
      [{ text: 'A', callback_data: 'nqo:0' }],
      [{ text: '✓ B', callback_data: 'nqo:1' }],
      [{ text: 'Отмена', callback_data: 'nqf:cancel' }],
    ]);
  });

  it('multiple без отметок — «Готово» скрыто', () => {
    const screen = correctWaitScreen('multiple', [{ text: 'A', correct: false }]);
    expect(screen.buttons.flat().map((b) => b.text)).toEqual(['A', 'Отмена']);
  });

  it('multiple с хотя бы одной отметкой — «Готово» появляется', () => {
    const screen = correctWaitScreen('multiple', [{ text: 'A', correct: true }]);
    expect(screen.buttons.flat().map((b) => b.text)).toEqual(['✓ A', 'Готово', 'Отмена']);
  });
});
