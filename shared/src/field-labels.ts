// Русские подписи полей DTO для текста ошибок валидации (CLAUDE.md, раздел
// «Ошибки»): `api/src/common/validation-messages.ts` подставляет их перед
// сообщением об ограничении («Название: заполните поле»), не голое имя поля
// camelCase/snake_case. Ключ — имя поля как оно приходит в теле/query
// запроса, один на все DTO, где оно встречается (одна механика — одно
// место). Полноту проверяет api/src/common/field-labels-coverage.spec.ts —
// он перебирает все DTO через class-validator и падает на поле без подписи.
export const FIELD_LABELS_RU: Record<string, string> = {
  // auth/telegram-login.dto.ts — поля виджета входа Telegram, snake_case
  // (контракт виджета, не наш API).
  id: 'Идентификатор',
  first_name: 'Имя',
  last_name: 'Фамилия',
  username: 'Имя пользователя в Telegram',
  photo_url: 'Ссылка на фото',
  auth_date: 'Время входа',
  hash: 'Подпись входа',

  // classes — /classes.
  title: 'Название',
  groupLabel: 'Название группы',
  format: 'Формат занятия',
  location: 'Адрес',
  zoomLink: 'Ссылка Zoom',
  zoomPassword: 'Пароль Zoom',
  leaderId: 'Ведущий',
  rules: 'Правила расписания',
  tz: 'Часовой пояс',
  channelIds: 'Каналы',
  leadMinutes: 'За сколько минут слать',
  active: 'Активность',
  weekday: 'День недели',
  time: 'Время',
  durationMin: 'Длительность',

  // lessons — /lessons.
  classId: 'Занятие',
  startsAt: 'Дата и время начала',
  topic: 'Тема',
  status: 'Статус',
  zoomLinkOverride: 'Ссылка Zoom для этого занятия',
  zoomPasswordOverride: 'Пароль Zoom для этого занятия',
  note: 'Заметка',
  url: 'Ссылка',
  telegramFileId: 'Файл в Telegram',

  // channels — /channels.
  type: 'Тип канала',
  config: 'Настройки канала',

  // broadcasts/deliveries — /broadcasts, /deliveries.
  text: 'Текст',
  scheduledAt: 'Время отправки',
  idempotencyKey: 'Ключ повтора',
  from: 'Начало периода',
  to: 'Конец периода',
  kind: 'Тип',
  limit: 'Лимит',

  // settings — /settings.
  lessonId: 'Дата занятия',
  templates: 'Шаблоны',
  lesson_link: 'Шаблон «Ссылка на занятие»',
  recording: 'Шаблон «Запись»',
  schoolSiteUrl: 'Адрес сайта школы',

  // users — /users (экран «Люди»).
  roles: 'Роли',

  // exam-items — /exam-items (банк вопросов экзамена). kind — общая подпись
  // «Тип» выше (broadcasts.kind), здесь свой тип вопроса — тот же смысл.
  prompt: 'Формулировка',
  hint: 'Подсказка',
  criteria: 'Критерии проверки',
  options: 'Варианты ответа',
  correct: 'Правильный вариант',
  tags: 'Теги',
  tag: 'Тег',

  // exams — /exams (конструктор экзамена, ТЗ 4.3). title/status — общие
  // подписи выше (classes.title, lessons.status), здесь тот же смысл:
  // название формы, статус формы.
  description: 'Описание',
  level: 'Уровень',
  blocks: 'Блоки',
  itemIds: 'Вопросы блока',
  shuffle: 'Перемешивание',
  required: 'Обязательность блока',
  timeLimitMin: 'Лимит времени',
  attemptsAllowed: 'Число попыток',

  // me/notifications — настройка уведомлений (ТЗ notifications-api.md).
  // kind — общая подпись «Тип» выше (broadcasts.kind), здесь вид уведомления.
  enabled: 'Включено',
};
