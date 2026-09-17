// Экраны диалога «Новый вопрос» (ТЗ 4б.3) — чистая логика без Mongo и без
// Telegram, как exam-question-screen.spec.ts.
import type { NewExamItemDraft } from '../new-exam-item-draft-wait';
import {
  confirmScreen,
  criteriaWaitScreen,
  kindSelectScreen,
  promptWaitScreen,
  withValidationErrors,
} from './new-exam-item-screens';

describe('kindSelectScreen', () => {
  it('четыре типа кнопками, у каждого объяснение в тексте, и «Отмена»', () => {
    const screen = kindSelectScreen();

    expect(screen.text).toContain('Свободный ответ — ученик пишет ответ словами');
    expect(screen.text).toContain('Один правильный вариант');
    expect(screen.text).toContain('Несколько правильных');
    expect(screen.text).toContain('Видео');
    expect(screen.buttons.flat().map((b) => b.text)).toEqual([
      'Свободный ответ',
      'Один правильный вариант',
      'Несколько правильных',
      'Видео',
      'Отмена',
    ]);
    expect(
      screen.buttons.flat().map((b) => ('callback_data' in b ? b.callback_data : '')),
    ).toEqual(['nqk:text', 'nqk:single', 'nqk:multiple', 'nqk:video', 'nqf:cancel']);
  });
});

describe('promptWaitScreen/criteriaWaitScreen', () => {
  it('просят формулировку, с «Отмена»', () => {
    const screen = promptWaitScreen();
    expect(screen.text).toContain('формулировку');
    expect(screen.buttons).toEqual([[{ text: 'Отмена', callback_data: 'nqf:cancel' }]]);
  });

  it('критерии — необязательный шаг, «Пропустить» и «Отмена»', () => {
    const screen = criteriaWaitScreen();
    expect(screen.text).toContain('критерии');
    expect(screen.buttons).toEqual([
      [{ text: 'Пропустить', callback_data: 'nqf:skip' }],
      [{ text: 'Отмена', callback_data: 'nqf:cancel' }],
    ]);
  });
});

describe('withValidationErrors', () => {
  it('дописывает ошибки сверху текста экрана, кнопки не трогает', () => {
    const screen = {
      text: 'Пришлите текст.',
      buttons: [[{ text: 'X', callback_data: 'a:b' }]],
    };
    const withErrors = withValidationErrors(screen, ['Формулировка: слишком длинно.']);
    expect(withErrors.text).toBe('Формулировка: слишком длинно.\n\nПришлите текст.');
    expect(withErrors.buttons).toBe(screen.buttons);
  });
});

describe('confirmScreen', () => {
  const base: NewExamItemDraft = {
    step: 'confirm',
    kind: 'single',
    prompt: 'Сколько форм в третьем уровне?',
    options: [
      { text: 'Три', correct: true },
      { text: 'Пять', correct: false },
    ],
    criteria: undefined,
  };

  it('тип, формулировку и варианты с отметкой верного', () => {
    const screen = confirmScreen(base);
    expect(screen.text).toContain('Тип: Один правильный вариант');
    expect(screen.text).toContain('Формулировка: Сколько форм в третьем уровне?');
    expect(screen.text).toContain('1. Три — верно');
    expect(screen.text).toContain('2. Пять');
    expect(screen.text).not.toContain('2. Пять — верно');
    expect(screen.text).not.toContain('Критерии проверки');
    expect(screen.buttons).toEqual([
      [{ text: 'Сохранить', callback_data: 'nqf:save' }],
      [{ text: 'Отмена', callback_data: 'nqf:cancel' }],
    ]);
  });

  it('критерии показаны, если заданы', () => {
    const screen = confirmScreen({ ...base, criteria: 'Смотрим стойку' });
    expect(screen.text).toContain('Критерии проверки: Смотрим стойку');
  });

  it('text/video — без строки «Варианты»', () => {
    const screen = confirmScreen({ ...base, kind: 'text', options: [] });
    expect(screen.text).not.toContain('Варианты');
  });

  it('без формулировки (защита в глубину) — пустая строка, не "undefined"', () => {
    const screen = confirmScreen({ ...base, prompt: undefined });
    expect(screen.text).toContain('Формулировка: \n');
  });
});
