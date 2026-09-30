// Выгрузка данных человека (ADR-0160, аудит 2026-09-29, M4): ответ на просьбу
// «какие данные обо мне хранит школа» — закон Израиля требует ответить за 30
// дней (PRIVACY_ACCESS_REPLY_DAYS), а без выгрузки это ручной поход в Atlas с
// расшифровкой полей. Обход — тот же реестр, что у удаления
// (UserDeletionService): аккаунт, владение по userId (USER_OWNED_COLLECTIONS),
// цели каскадов (USER_OWNED_CASCADES) и число ссылок на человека в данных
// школы (USER_REFERENCE_PATHS). Отдельного «списка для выгрузки» нет —
// второй список разошёлся бы с первым.
//
// Модели берём через connection.model(name), как в UserDeletionService: новая
// коллекция реестра подключается без правки конструктора. Читаем с проекцией
// по include (user-export.registry.ts) — секреты, байты и чужие данные не
// покидают базу, а не вычищаются после.
//
// Размер: одна выборка на человека, без пагинации — выгрузка по определению
// целиком и у одного человека ограничена самой предметной областью (десятки
// попыток и оплат, уведомления живут 90 дней). Пагинация «дай всё» из правил
// API касается списков, которые клиент листает.
import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { DateTime } from 'luxon';
import type { Connection } from 'mongoose';
import {
  USER_NOT_FOUND_MESSAGE,
  type ExportRecord,
  type UserDataExportDto,
  type UserDataExportReferenceDto,
  type UserDataExportSectionDto,
} from '@xuanxue/shared';
import { encryptSchemaFrom } from '../common/field-policy';
import { NotFoundError } from '../common/errors';
import { toIsoUtc } from '../common/iso-date';
import { MODEL_DEFINITIONS } from '../common/model.registry';
import { assertObjectId } from '../common/object-id';
import { decryptRecord } from '../utils/encryption';
import {
  USER_MODEL_NAME,
  USER_OWNED_CASCADES,
  USER_OWNED_COLLECTIONS,
} from './user-data.registry';
import {
  USER_EXPORT_NOTE,
  USER_EXPORT_REFERENCES,
  USER_EXPORT_SECTIONS,
  type ExportedModel,
} from './user-export.registry';
import { toExportObject } from './user-export-value';

type GenericRecord = Record<string, unknown>;

@Injectable()
export class UserExportService {
  private readonly logger = new Logger(UserExportService.name);

  constructor(@InjectConnection() private readonly connection: Connection) {}

  /** `requestedBy` — кто из админов выгрузил: в лог идёт вместе с userId, чтобы
   * было видно, кто и чьи данные доставал (в лог — только id и числа, CLAUDE.md
   * «Логи»). Свои данные админ выгрузить может: запрет нужен удалению, не чтению. */
  async exportUserData(userId: string, requestedBy: string): Promise<UserDataExportDto> {
    assertObjectId(userId, USER_NOT_FOUND_MESSAGE);
    const account = await this.readSection(USER_MODEL_NAME, { _id: userId });
    if (account.records.length === 0) throw new NotFoundError(USER_NOT_FOUND_MESSAGE);

    const sections: UserDataExportSectionDto[] = [account];
    for (const name of USER_OWNED_COLLECTIONS) {
      sections.push(await this.readSection(name, { userId }));
    }
    // Цель каскада не достать по userId: ссылка идёт от документа владения.
    for (const { from, path, model } of USER_OWNED_CASCADES) {
      const ids = await this.connection
        .model<GenericRecord>(from)
        .distinct(path, { userId });
      sections.push(await this.readSection(model, { _id: { $in: ids } }));
    }
    const references = await this.countReferences(userId);

    this.logger.log({
      userId,
      requestedBy,
      counts: Object.fromEntries(sections.map((s) => [s.key, s.records.length])),
      references: references.length,
    });
    return {
      exportedAt: toIsoUtc(DateTime.utc().toJSDate()),
      note: USER_EXPORT_NOTE,
      sections,
      references,
    };
  }

  private async readSection(
    name: ExportedModel,
    filter: GenericRecord,
  ): Promise<UserDataExportSectionDto> {
    const spec = USER_EXPORT_SECTIONS[name];
    const definition = MODEL_DEFINITIONS.find((def) => def.name === name);
    if (!definition) throw new Error(`Модель ${name} не найдена в MODEL_DEFINITIONS`);
    const encryptSchema = encryptSchemaFrom(definition.fieldPolicy);
    const projection = Object.fromEntries(
      [...spec.include, 'createdAt', 'updatedAt'].map((field) => [field, 1]),
    );
    const docs = await this.connection
      .model<GenericRecord>(name)
      .find(filter, projection)
      .sort({ createdAt: 1 })
      .lean<GenericRecord[]>();
    const records = docs.map((doc): ExportRecord => {
      const { _id, createdAt, updatedAt, ...fields } = decryptRecord(doc, encryptSchema);
      const shown = spec.refine ? spec.refine(fields) : fields;
      return toExportObject({ id: String(_id), ...shown, createdAt, updatedAt });
    });
    return { key: name, title: spec.title, retention: spec.retention, records };
  }

  private async countReferences(userId: string): Promise<UserDataExportReferenceDto[]> {
    const references: UserDataExportReferenceDto[] = [];
    for (const { model, path, title } of USER_EXPORT_REFERENCES) {
      const count = await this.connection
        .model<GenericRecord>(model)
        .countDocuments({ [path]: userId });
      if (count > 0) references.push({ title, count });
    }
    return references;
  }
}
