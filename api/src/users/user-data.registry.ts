// Реестр коллекций с пользовательскими данными — чеклист CLAUDE.md «Новая
// коллекция с полем userId»: удаление аккаунта и слияние аккаунтов идут по
// этому списку, забытая здесь модель означает данные, которые не удаляются
// или не переносятся при merge. Наследовано из telegram-bot-2
// (USER_DATA_TABLES / USER_OWNED_TABLES), адаптировано под Mongoose.
//
// Этап 0: моделей ещё нет, список пуст. Этап 1 добавит сюда имена коллекций
// по мере появления схем (ученики, занятия, рассылки).
export const USER_OWNED_COLLECTIONS = [] as const;

export type UserOwnedCollection = (typeof USER_OWNED_COLLECTIONS)[number];
