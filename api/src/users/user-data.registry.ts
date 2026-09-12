// Реестр коллекций с пользовательскими данными — чеклист CLAUDE.md «Новая
// коллекция с полем userId»: удаление аккаунта и слияние аккаунтов идут по
// этому списку, забытая здесь модель означает данные, которые не удаляются
// или не переносятся при merge. Наследовано из telegram-bot-2
// (USER_DATA_TABLES / USER_OWNED_TABLES), адаптировано под Mongoose.
//
// Этап 1: данные школы (classes, lessons, channels, broadcasts, deliveries)
// принадлежат школе, а не пользователю (ADR-0010) — userId у них нет, список
// остаётся пуст. У них есть ссылки НА пользователя (кто ведёт, кто создал) —
// они не про владение и сюда не входят, но их обязан переписать/обнулить тот
// же merge/delete, поэтому у них свой реестр ниже.
export const USER_OWNED_COLLECTIONS = [] as const;

// Имя модели пользователей по конвенции *Record этого проекта — совпадает с
// UserRecord.name в user.schema.ts (сверка — user-data.registry.spec.ts).
// Ссылки на пользователя (`ref:`) в других схемах сверяются с этим литералом
// в USER_REFERENCE_PATHS ниже.
export const USER_MODEL_NAME = 'UserRecord';

export type UserOwnedCollection = (typeof USER_OWNED_COLLECTIONS)[number];

// Ссылки на пользователя в данных школы: слияние аккаунтов переписывает их на
// новый id (`$set`), удаление аккаунта — обнуляет (`$unset`). Не признак
// владения (ADR-0010) — просто поле, которое не должно указывать в никуда.
export const USER_REFERENCE_PATHS = [
  { model: 'ClassRecord', path: 'leaderId' },
  { model: 'LessonRecord', path: 'leaderId' },
  { model: 'ChannelRecord', path: 'createdBy' },
  { model: 'BroadcastRecord', path: 'createdBy' },
  { model: 'ExamItemRecord', path: 'authorId' },
] as const;
