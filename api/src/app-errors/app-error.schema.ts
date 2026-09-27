// Журнал сбоев (ADR-0132): пишут DomainExceptionFilter (сбой сервера,
// ADR-0053) и ClientErrorsService (сбой в браузере, ADR-0071) через порт
// AppErrorJournal (api/src/common/app-error-journal.ts); читает экран «Сбои»
// (роль `admin`, в интерфейсе подписана «Разработчик») через
// `GET /dev/errors`. До этой коллекции текст ошибки жил только в логах
// Railway.
//
// Не про пользователя школы (CLAUDE.md «Новая коллекция», чеклист п.1):
// userId нет и быть не может — сбой чинит не тот, у кого он произошёл, а
// админ, и запись не принадлежит человеку, у которого экран не нарисовался.
// В USER_OWNED_COLLECTIONS не входит, решение задокументировано явно здесь и
// в user-data.registry.ts, а не молчаливым пропуском реестра.
//
// retention: TTL-индекс на `occurredAt`, APP_ERROR_LIMITS.retentionDays дней
// (сейчас 30) — сбой месячной давности никто не разбирает (shared/src/app-errors.ts).
// Дополнительно — потолок числа записей (APP_ERROR_LIMITS.maxRecords):
// AppErrorsService.record удаляет самые старые сверх потолка сразу после
// вставки, TTL один не спас бы от всплеска отчётов браузера за минуты.
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { APP_ERROR_KINDS, APP_ERROR_LIMITS, APP_ERROR_SOURCES } from '@xuanxue/shared';
import type { AppErrorKind, AppErrorSource } from '@xuanxue/shared';
import { enc, encryptSchemaFrom, plain, type FieldPolicy } from '../common/field-policy';

@Schema({ timestamps: true, collection: 'app_errors' })
export class AppErrorRecord {
  // Код обращения (x-request-id) — ключ точного поиска (`GET /dev/errors?requestId=`),
  // тот же приём, что у алёрта в Telegram. Не у каждой записи: браузер до
  // входа мог получить его от pino-http, а мог и нет.
  @Prop({ type: String, required: false })
  requestId?: string;

  @Prop({ type: String, enum: APP_ERROR_SOURCES, required: true })
  source!: AppErrorSource;

  @Prop({ type: String, enum: APP_ERROR_KINDS, required: true })
  kind!: AppErrorKind;

  // Только у серверного сбоя (source: 'server') — метод HTTP запроса.
  @Prop({ type: String, required: false })
  method?: string;

  @Prop({ type: String, required: true })
  path!: string;

  @Prop({ type: String, required: true })
  text!: string;

  @Prop({ type: String, required: false })
  userAgent?: string;

  // Момент сбоя — отдельно от `createdAt` (timestamps: true пишет его же
  // фактически в тот же момент), но явное поле нужно для TTL-индекса и для
  // сортировки списка без завязки на служебное поле Mongoose.
  @Prop({ type: Date, required: true })
  occurredAt!: Date;
}

export const AppErrorSchema = SchemaFactory.createForClass(AppErrorRecord);

// Точный поиск по коду обращения (ссылка из алёрта Telegram — ADR-0132).
AppErrorSchema.index({ requestId: 1 });
// Список журнала — свежие сверху, без сканирования всей коллекции.
AppErrorSchema.index({ occurredAt: -1 });
// Фильтр экрана «Сбои» по виду — тот же порядок сортировки, что у списка целиком.
AppErrorSchema.index({ kind: 1, occurredAt: -1 });
// TTL: другой ключ индекса ({occurredAt: 1}, не {-1} выше), Mongo разрешает
// оба на одном поле. expireAfterSeconds: 0 здесь не подходит — время
// хранения не «в это поле записан момент удаления» (как у email_login_tokens/
// bot_sessions), а «через N дней после occurredAt» — тот же приём, что у
// notifications (NOTIFICATION_RETENTION_DAYS).
AppErrorSchema.index(
  { occurredAt: 1 },
  { expireAfterSeconds: APP_ERROR_LIMITS.retentionDays * 24 * 60 * 60 },
);

export const APP_ERROR_FIELD_POLICY: FieldPolicy = {
  // requestId/method/path — ссылки и служебные строки для поиска и фильтра,
  // не свободный текст (SECURITY §5, тот же довод, что у notifications.examId).
  requestId: plain('код обращения — ключ точного поиска, не свободный текст'),
  method: plain('метод HTTP — короткая служебная строка, не текст'),
  path: plain('адрес экрана или путь запроса без query — ссылка, не текст (SECURITY §6)'),
  // Текст ошибки может содержать то, что ввёл человек (сообщение исключения
  // валидатора цитирует значение поля) — свободный текст, шифруется
  // (SECURITY §5/§11).
  text: enc,
  // User-Agent браузера — строка, которую формирует браузер, а не вводит
  // человек (шаблонный набор токенов вида "Mozilla/5.0 (…) Chrome/…"), тем
  // же приёмом, что path выше: не свободный текст, но решение по нему явное,
  // а не «раз похоже на путь — не считаем строкой» — оставляем открытым,
  // чтобы искать по журналу и группировать сбои по браузеру, не расшифровывая
  // каждую запись по одной.
  userAgent: plain('строка браузера, не текст, который вводит человек'),
};

/** Схема шифрования записи журнала — одна на запись и чтение
 * (app-errors.service.ts), тем же приёмом, что у соседних коллекций. */
export const APP_ERROR_ENCRYPT_SCHEMA = encryptSchemaFrom(APP_ERROR_FIELD_POLICY);
