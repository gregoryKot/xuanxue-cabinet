// Чистая логика меню — без Mongo и без Telegram (CLAUDE.md «Тесты»).
import {
  buildBotMenu,
  buildHelpText,
  buildStrangerMessage,
  buildStudentMenu,
  isMenuScreenAction,
} from './bot-menu';

describe('buildBotMenu', () => {
  it('пять кнопок экранов', () => {
    const menu = buildBotMenu();

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
  it('контакт не задан — текст обрывается на связке, без «Напишите» в пустоту', () => {
    expect(buildStrangerMessage()).not.toContain('Напишите');
    expect(buildStrangerMessage()).toContain('Сюань-Сюэ');
  });

  it('контакт задан — новичку есть кому написать', () => {
    expect(buildStrangerMessage('Диме @Dmitry_Deitch')).toContain(
      'Ещё не занимаетесь в школе? Напишите Диме @Dmitry_Deitch',
    );
  });

  // ADR-0115: отказ без пути внутрь оставлял ученика, не нажавшего «Связать
  // Telegram», перед закрытой дверью — тот, у кого кабинет есть, должен
  // прочитать, что именно нажать. Две ветки в одном тексте: различить
  // ученика школы и человека со стороны мы не можем (SECURITY §2).
  it('называет обе ветки: ученику — кнопку связки, новичку — контакт', () => {
    const text = buildStrangerMessage('Диме @Dmitry_Deitch');

    expect(text).toContain('Связать Telegram');
    expect(text).toContain('Напишите Диме @Dmitry_Deitch');
  });

  it('бот назван учеников, а не учителя (отзыв владельца 2026-09-22)', () => {
    expect(buildStrangerMessage()).toContain('для её учеников');
  });
});

describe('buildHelpText', () => {
  // Список команд не дублируем — Telegram уже показывает их в меню чата
  // (bot-commands.ts); /help называет то, чего там нет.
  it('учителю сказано, куда девать запись занятия — этого нет в меню Telegram', () => {
    expect(buildHelpText('staff')).toContain('Запись занятия');
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

// Ошибка 2026-09-22 (ADR-0115, CLAUDE.md «Ошибка чинится вместе с причиной»):
// бот обзавёлся второй аудиторией — экзамены (ADR-0024), личный канал
// ученика (ADR-0027), его уведомления (ADR-0065), — а единственный текст,
// называющий аудиторию, остался учительским, и ученик читал в нём отказ.
// Гейт на весь класс ошибки, а не на одну строку: ни один текст, который бот
// шлёт не-штату, не объявляет бота чужим. Новый такой текст дописывается в
// список ниже — иначе он выпадет из проверки молча.
describe('тексты бота не-штату', () => {
  it.each<[string, string]>([
    ['незнакомцу без контакта новичка', buildStrangerMessage()],
    ['незнакомцу с контактом новичка', buildStrangerMessage('Диме @Dmitry_Deitch')],
    ['/help ученику', buildHelpText('student')],
    ['меню ученика', buildStudentMenu().text],
  ])('%s — бот не объявлен учительским', (_place, text) => {
    expect(text).not.toMatch(/для\s+учител[яю]|бот\s+учител[яю]/i);
  });
});
