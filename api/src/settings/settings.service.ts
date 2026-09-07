// Настройки школы — один документ, создаётся при первом обращении с
// дефолтными шаблонами (docs/PLAN.md §4): рендер поста невозможен без
// шаблона, поэтому документ не может «просто отсутствовать» дольше одного
// вызова. `update`/`preview` — экран «Шаблоны» (docs/PLAN.md §6), проверка
// плейсхолдеров и сам предпросмотр вынесены в settings-templates.ts/
// settings-preview.ts (файл-лимит 150 строк, CLAUDE.md «Храповики»).
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { DateTime } from 'luxon';
import {
  DEFAULT_TEMPLATES,
  SCHOOL_TZ,
  type PreviewTemplateInput,
  type PreviewTemplateResult,
  type SettingsDto,
  type UpdateSettingsInput,
} from '@xuanxue/shared';
import { NotFoundError } from '../common/errors';
import { toIsoUtc } from '../common/iso-date';
import { isDuplicateKeyError } from '../common/mongo-error-codes';
import { ClassRecord } from '../classes/class.schema';
import { LessonRecord } from '../lessons/lesson.schema';
import { UsersService } from '../users/users.service';
import { previewTemplate } from './settings-preview';
import { SettingsRecord, SETTINGS_SCHOOL_ID } from './settings.schema';
import { assertKnownPlaceholders, templatesSetFrom } from './settings-templates';

const SETTINGS_NOT_FOUND = 'Настройки школы не найдены. Повторите запрос.';

type LeanSettings = Pick<SettingsRecord, 'templates' | 'tz'> & { updatedAt: Date };

function toSettingsDto(doc: LeanSettings): SettingsDto {
  return {
    templates: {
      lesson_link: doc.templates.lessonLink,
      recording: doc.templates.recording,
    },
    tz: doc.tz,
    updatedAt: toIsoUtc(doc.updatedAt),
  };
}

@Injectable()
export class SettingsService {
  constructor(
    @InjectModel(SettingsRecord.name) private readonly model: Model<SettingsRecord>,
    @InjectModel(LessonRecord.name) private readonly lessonModel: Model<LessonRecord>,
    @InjectModel(ClassRecord.name) private readonly classModel: Model<ClassRecord>,
    private readonly usersService: UsersService,
  ) {}

  /** Документ школы почти всегда уже есть — обычное чтение `findById`
   * дешевле `findOneAndUpdate` на каждый вызов (upsert — это ещё и запись).
   * Upsert по фиксированному `_id` нужен только один раз, при первом
   * обращении: гонка двух первых запросов (два инстанса при деплое) не
   * создаёт второй документ школы. `findOneAndUpdate` с `upsert` под
   * настоящей гонкой (не мок — CLAUDE.md «Тесты») может бросить E11000 по
   * `_id`: побеждает та же идея, что у upsertTelegramChat
   * (channel-config.service.ts) — проигравший читает уже созданный документ,
   * а не падает. */
  async get(): Promise<SettingsDto> {
    const existing = await this.model.findById(SETTINGS_SCHOOL_ID).lean<LeanSettings>();
    if (existing) return toSettingsDto(existing);

    try {
      const doc = await this.model
        .findOneAndUpdate(
          { _id: SETTINGS_SCHOOL_ID },
          {
            $setOnInsert: {
              templates: {
                lessonLink: DEFAULT_TEMPLATES.lesson_link,
                recording: DEFAULT_TEMPLATES.recording,
              },
              tz: SCHOOL_TZ,
            },
          },
          { upsert: true, returnDocument: 'after' },
        )
        .lean<LeanSettings>();
      return toSettingsDto(doc);
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
      const doc = await this.model.findById(SETTINGS_SCHOOL_ID).lean<LeanSettings>();
      if (!doc) throw new NotFoundError(SETTINGS_NOT_FOUND);
      return toSettingsDto(doc);
    }
  }

  /** PATCH `templates` (docs/PLAN.md §6 «Шаблоны») — плейсхолдеры проверены
   * ещё до записи (assertKnownPlaceholders), `get()` до апдейта гарантирует,
   * что документ школы уже существует (тот же upsert, что и у обычного
   * чтения) — $set по несуществующему `_id` в production (`autoIndex:
   * false`, но upsert тут не выставлен намеренно) молча ничего не изменил бы. */
  async update(input: UpdateSettingsInput): Promise<SettingsDto> {
    if (input.templates) assertKnownPlaceholders(input.templates);
    const $set = input.templates ? templatesSetFrom(input.templates) : {};
    // `{}` в теле (оба шаблона опциональны) или объект, где оба значения
    // undefined (class-transformer материализует поля DTO, даже когда в
    // запросе их не было — Object.keys(input.templates) тут не пустой,
    // проверяем реальный $set) — писать нечего: пустой `$set` MongoDB
    // отвергает, а обновлять `updatedAt` без изменения — вводить учителя в
    // заблуждение («когда обновили в последний раз» стало бы неправдой).
    if (Object.keys($set).length === 0) return this.get();
    await this.get();
    const doc = await this.model
      .findOneAndUpdate(
        { _id: SETTINGS_SCHOOL_ID },
        { $set },
        { returnDocument: 'after' },
      )
      .lean<LeanSettings>();
    if (!doc) throw new NotFoundError(SETTINGS_NOT_FOUND);
    return toSettingsDto(doc);
  }

  /** Предпросмотр сохранённого шаблона на реальном занятии (`POST
   * /settings/preview`, docs/PLAN.md §6) — того, что прямо сейчас в базе, не
   * текста в форме: `template` опциональным телом сюда сознательно не
   * добавляем — preview показывает пост так, как его увидит следующий
   * получатель прямо сейчас, а не гипотезу «а если бы я сохранил вот это». */
  async preview(
    input: PreviewTemplateInput,
    now: DateTime,
  ): Promise<PreviewTemplateResult> {
    const settings = await this.get();
    return previewTemplate(
      this.lessonModel,
      this.classModel,
      this.usersService,
      settings.templates,
      input.kind,
      input.lessonId,
      now,
    );
  }
}
