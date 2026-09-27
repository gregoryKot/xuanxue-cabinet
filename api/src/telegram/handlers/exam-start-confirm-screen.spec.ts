// Чистая логика, без Mongo и без Telegram (CLAUDE.md «Тесты»): экран
// подтверждения перед стартом попытки с лимитом времени и перед повтором,
// затирающим прошлую просроченную попытку (ADR-0131).
import { buildExamRetryDeleteWarning, buildExamStartWarning } from '@xuanxue/shared';
import { buildExamStartConfirmScreen } from './exam-start-confirm-screen';

describe('buildExamStartConfirmScreen', () => {
  it('заголовок и предупреждение — общие с кабинетом (ADR-0121)', () => {
    const menu = buildExamStartConfirmScreen('e1', 45, false);
    expect(menu.text).toContain('Вы начинаете экзамен');
    expect(menu.text).toContain(buildExamStartWarning(45));
  });

  it('кнопка «Начать экзамен» ведёт на exam:<examId>', () => {
    const menu = buildExamStartConfirmScreen('e1', 45, false);
    expect(menu.buttons[0]).toEqual([
      { text: 'Начать экзамен', callback_data: 'exam:e1' },
    ]);
  });

  it('кнопка «Не сейчас» возвращает в список экзаменов', () => {
    const menu = buildExamStartConfirmScreen('e1', 45, false);
    expect(menu.buttons[1]).toEqual([{ text: 'Не сейчас', callback_data: 'menu:exams' }]);
  });

  it('повтор, затирающий прошлую попытку — своё предупреждение и подпись кнопки (ADR-0131)', () => {
    const menu = buildExamStartConfirmScreen('e1', 45, true);
    expect(menu.text).toContain('Начать заново?');
    expect(menu.text).toContain(buildExamRetryDeleteWarning(45));
    expect(menu.buttons[0]).toEqual([
      { text: 'Начать заново', callback_data: 'exam:e1' },
    ]);
  });

  it('повтор без лимита времени — тот же экран, лимита в тексте нет', () => {
    const menu = buildExamStartConfirmScreen('e1', undefined, true);
    expect(menu.text).toContain('Начать заново?');
    expect(menu.text).toContain(buildExamRetryDeleteWarning(undefined));
    expect(menu.text).not.toContain('На экзамен —');
  });
});
