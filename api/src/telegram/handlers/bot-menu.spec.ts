// Чистая логика меню — без Mongo и без Telegram (CLAUDE.md «Тесты»).
import {
  buildBotMenu,
  buildHelpText,
  buildStrangerMessage,
  isMenuScreenAction,
} from './bot-menu';

describe('buildBotMenu', () => {
  it('пять кнопок экранов и подсказка про тему занятия', () => {
    const menu = buildBotMenu();

    expect(menu.text).toContain('/topic');
    expect(menu.buttons.flat().map((b) => b.text)).toEqual([
      'Ближайшие занятия',
      'Экзамены',
      'Новый вопрос',
      'Собрать экзамен',
      'Уведомления',
    ]);
  });

  it('кнопки несут своё действие в callback data', () => {
    const menu = buildBotMenu();

    expect(
      menu.buttons.flat().map((b) => ('callback_data' in b ? b.callback_data : '')),
    ).toEqual([
      'menu:schedule',
      'menu:exams',
      'menu:newitem',
      'menu:newexam',
      'menu:notifications',
    ]);
  });
});

describe('buildStrangerMessage', () => {
  it('адрес школы не заполнен — только объяснение, без пустой ссылки', () => {
    expect(buildStrangerMessage()).toBe('Этот бот для учителя школы Сюань-Сюэ.');
  });

  it('адрес заполнен — незнакомцу есть куда пойти', () => {
    expect(buildStrangerMessage('https://xuanxue.su')).toContain('https://xuanxue.su');
  });
});

describe('buildHelpText', () => {
  it('учителю перечислены команды, включая тему занятия', () => {
    expect(buildHelpText('staff')).toContain('/topic');
  });

  it('ученику про тему занятия не рассказываем — это не его дело', () => {
    expect(buildHelpText('student')).not.toContain('/topic');
  });

  it('ученику рассказываем про экзамены в боте', () => {
    expect(buildHelpText('student')).toContain('/exams');
  });
});

describe('isMenuScreenAction', () => {
  it('свои экраны пропускает, чужое значение — нет', () => {
    expect(isMenuScreenAction('schedule')).toBe(true);
    expect(isMenuScreenAction('notifications')).toBe(true);
    expect(isMenuScreenAction('exams')).toBe(true);
    expect(isMenuScreenAction('back')).toBe(true);
    expect(isMenuScreenAction('делай-что-хочешь')).toBe(false);
  });
});
