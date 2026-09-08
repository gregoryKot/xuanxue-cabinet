import type { Db } from 'mongodb';

// Реестр миграций Mongo. Порядок массива — порядок применения. `id` — ключ
// записи о применении в коллекции `migrations`; менять id уже закоммиченной
// миграции нельзя — раннер решит, что это новая, и применит её повторно.
export interface Migration {
  id: string;
  up: (db: Db) => Promise<void>;
}

// Этап 1: модели есть, но ни одна ещё не требовала миграции данных —
// реестр пуст, раннер и коллекция `migrations` готовы к первой записи.
export const MIGRATIONS: Migration[] = [];
