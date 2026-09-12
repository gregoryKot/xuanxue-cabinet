// Список разделов «Настроек» — данные отдельно от разметки: экран рендерит
// карточки циклом, а порядок и подписи правятся здесь (CLAUDE.md «Логика вне
// компонентов», тот же приём, что у navItems.ts).
//
// Подсказка под названием отвечает на «зачем сюда заходить» — без неё список
// из пяти ссылок ничего не объясняет новичку (CLAUDE.md «Каждая фича
// объясняет откуда это и зачем»).
export interface SettingsLink {
  to: string;
  title: string;
  hint: string;
  icon: 'schedule' | 'channels' | 'templates' | 'broadcasts' | 'people' | 'examItems';
  adminOnly?: boolean;
}

export const SETTINGS_LINKS: SettingsLink[] = [
  {
    to: '/schedule',
    title: 'Расписание занятий',
    hint: 'Дни, время, ссылки Zoom, ведущие. Из них рождаются занятия на «Занятиях».',
    icon: 'schedule',
  },
  {
    to: '/channels',
    title: 'Каналы',
    hint: 'Куда уходят посты. Telegram-группа подключается сама, когда в неё добавили бота.',
    icon: 'channels',
  },
  {
    to: '/templates',
    title: 'Шаблоны постов',
    hint: 'Тексты, которыми бот пишет в канал, и адрес сайта школы.',
    icon: 'templates',
  },
  {
    to: '/broadcasts',
    title: 'Журнал рассылок',
    hint: 'Что ушло, что ждёт и что не отправилось — с причиной.',
    icon: 'broadcasts',
  },
  {
    to: '/exam-items',
    title: 'Вопросы для экзамена',
    hint: 'Из них собирается экзамен. Один вопрос можно поставить в несколько экзаменов.',
    icon: 'examItems',
  },
  {
    to: '/people',
    title: 'Люди',
    hint: 'Кто вошёл в кабинет и с какой ролью.',
    icon: 'people',
    adminOnly: true,
  },
];
