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

  // users/dto/update-my-profile.dto.ts — экран первого входа (ADR-0044).
  // camelCase, в отличие от snake_case виджета Telegram выше: это поля
  // нашей формы, а не чужого контракта.
  firstName: 'Имя',
  lastName: 'Фамилия',

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
  previewMinutes: 'За сколько минут показывать черновик поста',
  newcomerContact: 'Кому писать, если человек ещё не в школе',

  // users — /users (экран «Люди»).
  roles: 'Роли',

  // exam-items — /exam-items (вопросы экзамена). kind — общая подпись
  // «Тип» выше (broadcasts.kind), здесь свой тип вопроса — тот же смысл.
  // hint/criteria/tags вопроса убраны из продукта (ADR-0128) — подписи ниже
  // теперь только про материалы (tags/tag, ADR-0058).
  prompt: 'Формулировка',
  options: 'Варианты ответа',
  correct: 'Правильный вариант',
  imageId: 'Картинка варианта',
  tags: 'Теги',
  tag: 'Тег',

  // exams — /exams (конструктор экзамена, ТЗ 4.3). title/status — общие
  // подписи выше (classes.title, lessons.status), здесь тот же смысл:
  // название формы, статус формы.
  description: 'Описание',
  level: 'Уровень',
  blocks: 'Блоки',
  outcome: 'Итог',
  itemIds: 'Вопросы',
  shuffle: 'Перемешивание вопросов',
  questionsPerAttempt: 'Вопросов ученику в попытке',
  requiredItemIds: 'Обязательные вопросы',
  shuffleOptions: 'Перемешивание вариантов ответа',
  timeLimitMin: 'Лимит времени',
  dueAt: 'Срок сдачи',
  attemptsAllowed: 'Число попыток',

  // me/notifications — настройка уведомлений (ТЗ notifications-api.md).
  // kind — общая подпись «Тип» выше (broadcasts.kind), здесь вид уведомления.
  enabled: 'Включено',

  // auth/join/check — код ссылки-приглашения школы (ADR-0030, ADR-0036).
  code: 'Код ссылки-приглашения',
  inviteCode: 'Код ссылки-приглашения',

  // payments — /payments, /me/payments (docs/PLAN.md §15, ADR-0049).
  // status/limit — общие подписи выше (deliveries.status, broadcasts.limit).
  month: 'Месяц',
  amountMinor: 'Сумма',

  // users/dto/set-no-telegram.dto.ts — отметка «у меня нет Telegram»
  // (ADR-0067). Подпись называет саму отметку: в форму поле не выводится, но
  // текст ошибки человек всё равно читает, и голое `noTelegram` ему ни о чём
  // не говорит.
  noTelegram: 'Отметка «у меня нет Telegram»',

  // client-errors — POST /client-errors (ADR-0071, отчёт браузера о сбое).
  // kind — общая подпись «Тип» выше (broadcasts.kind), здесь вид сбоя.
  message: 'Сообщение об ошибке',
  path: 'Адрес экрана',

  // push — /me/push-subscriptions (ADR-0092). Эти поля собирает браузер сам
  // (`pushManager.subscribe()`), человек их не печатает — подпись нужна на
  // случай сбоя клиента, не для формы.
  endpoint: 'Адрес подписки браузера',
  p256dh: 'Ключ шифрования подписки',
  auth: 'Секрет подписки',
};
