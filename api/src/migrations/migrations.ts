import type { Db } from 'mongodb';
import { seedSchoolClasses } from './0001-school-classes.migration';

// Реестр миграций Mongo. Порядок массива — порядок применения. `id` — ключ
// записи о применении в коллекции `migrations`; менять id уже закоммиченной
// миграции нельзя — раннер решит, что это новая, и применит её повторно.
export interface Migration {
  id: string;
  up: (db: Db) => Promise<void>;
}

export const MIGRATIONS: Migration[] = [seedSchoolClasses];
