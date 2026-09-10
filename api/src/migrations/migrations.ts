import type { ConfigService } from '@nestjs/config';
import type { Db } from 'mongodb';
import { seedSchoolClasses } from './0001-school-classes.migration';
import { fillClassZoomLinks } from './0002-class-zoom-links.migration';

// Реестр миграций Mongo. Порядок массива — порядок применения. `id` — ключ
// записи о применении в коллекции `migrations`; менять id уже закоммиченной
// миграции нельзя — раннер решит, что это новая, и применит её повторно.
//
// `config` — тот же ConfigService, что у всего приложения: миграции читают
// окружение через него, а не из process.env (CLAUDE.md «Конфигурация»).
// Миграции, которым окружение не нужно, аргумент просто не берут.
export interface Migration {
  id: string;
  up: (db: Db, config: ConfigService) => Promise<void>;
}

export const MIGRATIONS: Migration[] = [seedSchoolClasses, fillClassZoomLinks];
