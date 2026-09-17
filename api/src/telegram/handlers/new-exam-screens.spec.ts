// Чистая логика экранов диалога «Собрать экзамен» — без Mongo и без
// Telegram (CLAUDE.md «Тесты»).
import {
  attemptsScreen,
  confirmScreen,
  timeLimitScreen,
  titleWaitScreen,
} from './new-exam-screens';

describe('titleWaitScreen', () => {
  it('просит название, кнопка — только «Отмена»', () => {
    const screen = titleWaitScreen();
    expect(screen.text).toContain('название');
    expect(screen.buttons.flat().map((b) => b.text)).toEqual(['Отмена']);
  });
});

describe('timeLimitScreen', () => {
  it('кнопки — без лимита/15/30/60, плюс «Отмена»', () => {
    const screen = timeLimitScreen();
    expect(screen.buttons.flat().map((b) => b.text)).toEqual([
      'Без лимита',
      '15 минут',
      '30 минут',
      '60 минут',
      'Отмена',
    ]);
    expect(screen.text).toContain('число минут');
  });
});

describe('attemptsScreen', () => {
  it('кнопки 1/2/3 в одной строке, плюс «Отмена»', () => {
    const screen = attemptsScreen();
    expect(screen.buttons[0]?.map((b) => b.text)).toEqual(['1', '2', '3']);
    expect(screen.buttons[1]?.map((b) => b.text)).toEqual(['Отмена']);
  });
});

describe('confirmScreen', () => {
  it('без лимита — строка «без лимита», не «0 минут»', () => {
    const screen = confirmScreen({
      step: 'confirm',
      page: 0,
      itemIds: ['a', 'b'],
      title: 'Экзамен по форме',
      attemptsAllowed: 2,
    });
    expect(screen.text).toContain('Вопросов: 2');
    expect(screen.text).toContain('без лимита');
    expect(screen.text).toContain('Попыток: 2');
    expect(screen.buttons.flat().map((b) => b.text)).toEqual(['Опубликовать', 'Отмена']);
  });

  it('с лимитом — «30 минут», не число без слова', () => {
    const screen = confirmScreen({
      step: 'confirm',
      page: 0,
      itemIds: ['a'],
      title: 'Экзамен',
      timeLimitMin: 30,
      attemptsAllowed: 1,
    });
    expect(screen.text).toContain('30 минут');
  });

  // Защита в глубину — title/attemptsAllowed к шагу 'confirm' уже заданы в
  // обычном диалоге, но пустая строка вместо «undefined» в тексте нужна и
  // черновику, поправленному мимо кнопок.
  it('title/attemptsAllowed не заданы (защита в глубину) — пустая строка, не «undefined»', () => {
    const screen = confirmScreen({ step: 'confirm', page: 0, itemIds: [] });
    expect(screen.text).toContain('Название: \n\n');
    expect(screen.text).toContain('Попыток: \n\n');
    expect(screen.text).not.toContain('undefined');
  });
});
