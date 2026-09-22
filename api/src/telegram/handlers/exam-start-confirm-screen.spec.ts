// Чистая логика, без Mongo и без Telegram (CLAUDE.md «Тесты»): экран
// подтверждения перед стартом попытки с лимитом времени.
import { buildExamStartWarning } from '@xuanxue/shared';
import { buildExamStartConfirmScreen } from './exam-start-confirm-screen';

describe('buildExamStartConfirmScreen', () => {
  it('заголовок и предупреждение — общие с кабинетом (ADR-0121)', () => {
    const menu = buildExamStartConfirmScreen('e1', 45);
    expect(menu.text).toContain('Вы начинаете экзамен');
    expect(menu.text).toContain(buildExamStartWarning(45));
  });

  it('кнопка «Начать экзамен» ведёт на exam:<examId>', () => {
    const menu = buildExamStartConfirmScreen('e1', 45);
    expect(menu.buttons[0]).toEqual([
      { text: 'Начать экзамен', callback_data: 'exam:e1' },
    ]);
  });

  it('кнопка «Не сейчас» возвращает в список экзаменов', () => {
    const menu = buildExamStartConfirmScreen('e1', 45);
    expect(menu.buttons[1]).toEqual([{ text: 'Не сейчас', callback_data: 'menu:exams' }]);
  });
});
