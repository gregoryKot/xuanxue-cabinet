import type { Db } from 'mongodb';

// Реестр миграций Mongo. Порядок массива — порядок применения. `id` — ключ
// записи о применении в коллекции `migrations`; менять id уже закоммиченной
// миграции нельзя — раннер решит, что это новая, и применит её повторно.
export interface Migration {
  id: string;
  up: (db: Db) => Promise<void>;
}

// Этап 0: моделей и данных для миграции ещё нет.
export const MIGRATIONS: Migration[] = [];
