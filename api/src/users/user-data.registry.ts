// Реестр коллекций с пользовательскими данными — чеклист CLAUDE.md «Новая
// коллекция с полем userId»: удаление аккаунта и слияние аккаунтов идут по
// этому списку, забытая здесь модель означает данные, которые не удаляются
// или не переносятся при merge. Наследовано из telegram-bot-2
// (USER_DATA_TABLES / USER_OWNED_TABLES), адаптировано под Mongoose.
//
// Этап 1: данные школы (classes, lessons, channels, broadcasts, deliveries)
// принадлежат школе, а не пользователю (ADR-0009) — userId у них нет, список
// остаётся пуст. У них есть ссылки НА пользователя (кто ведёт, кто создал) —
// они не про владение и сюда не входят, но их обязан переписать/обнулить тот
// же merge/delete, поэтому у них свой реестр ниже.
export const USER_OWNED_COLLECTIONS = [] as const;

// Имя модели пользователей по конвенции *Record этого проекта — схема
// появится вместе со входом. Ссылки на пользователя (`ref:`) в других схемах
// заводятся уже сейчас, до неё, чтобы `USER_REFERENCE_PATHS` не разъезжался
// с литералом по буквам.
export const USER_MODEL_NAME = 'UserRecord';

export type UserOwnedCollection = (typeof USER_OWNED_COLLECTIONS)[number];

// Ссылки на пользователя в данных школы: слияние аккаунтов переписывает их на
// новый id (`$set`), удаление аккаунта — обнуляет (`$unset`). Не признак
// владения (ADR-0009) — просто поле, которое не должно указывать в никуда.
export const USER_REFERENCE_PATHS = [
  { model: 'ClassRecord', path: 'leaderId' },
  { model: 'LessonRecord', path: 'leaderId' },
  { model: 'ChannelRecord', path: 'createdBy' },
  { model: 'BroadcastRecord', path: 'createdBy' },
] as const;
