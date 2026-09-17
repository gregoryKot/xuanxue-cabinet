import type { Db } from 'mongodb';
import { seedSchoolClasses } from './0001-school-classes.migration';
import { fillSchoolZoomLinks } from './0003-school-zoom-links.migration';
import { attachChannelsToClasses } from './0004-attach-channels-to-classes.migration';
import { recordingTemplateWithoutDuration } from './0005-recording-template-without-duration.migration';
import { examItemsPublishedByDefault } from './0006-exam-items-published-by-default.migration';
import { invitedUsersActive } from './0007-invited-users-active.migration';

// Реестр миграций Mongo. Порядок массива — порядок применения. `id` — ключ
// записи о применении в коллекции `migrations`; менять id уже закоммиченной
// миграции нельзя — раннер решит, что это новая, и применит её повторно.
//
// Номер 0002 пропущен намеренно: та миграция читала ссылки Zoom из переменной
// окружения и прожила сутки — ссылки оказались не секретом и переехали в сам
// репозиторий (ADR-0019, второе дополнение). На проде её id уже записан как
// применённый, поэтому номер не переиспользуется. По той же причине 0003 стоит
// в списке после 0004: 0004 уехала на прод раньше, чем нашлось решение по
// ссылкам, и порядок здесь описывает то, что уже случилось.
export interface Migration {
  id: string;
  up: (db: Db) => Promise<void>;
}

export const MIGRATIONS: Migration[] = [
  seedSchoolClasses,
  attachChannelsToClasses,
  fillSchoolZoomLinks,
  recordingTemplateWithoutDuration,
  examItemsPublishedByDefault,
  invitedUsersActive,
];
