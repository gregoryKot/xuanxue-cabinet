// Настройки школы — один документ, создаётся при первом обращении с
// дефолтными шаблонами (docs/PLAN.md §4): рендер поста невозможен без
// шаблона, поэтому документ не может «просто отсутствовать» дольше одного
// вызова. API `/settings` для правки шаблонов учителем — отдельный PR.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DEFAULT_TEMPLATES, SCHOOL_TZ, type TemplateKind } from '@xuanxue/shared';
import { NotFoundError } from '../common/errors';
import { isDuplicateKeyError } from '../common/mongo-error-codes';
import { SettingsRecord, SETTINGS_SCHOOL_ID } from './settings.schema';

export interface SchoolSettings {
  templates: Record<TemplateKind, string>;
  tz: string;
}

type LeanSettings = Pick<SettingsRecord, 'templates' | 'tz'>;

function toSchoolSettings(doc: LeanSettings): SchoolSettings {
  return {
    templates: {
      lesson_link: doc.templates.lessonLink,
      recording: doc.templates.recording,
    },
    tz: doc.tz,
  };
}

@Injectable()
export class SettingsService {
  constructor(
    @InjectModel(SettingsRecord.name) private readonly model: Model<SettingsRecord>,
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
  async get(): Promise<SchoolSettings> {
    const existing = await this.model.findById(SETTINGS_SCHOOL_ID).lean<LeanSettings>();
    if (existing) return toSchoolSettings(existing);

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
      return toSchoolSettings(doc);
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
      const doc = await this.model.findById(SETTINGS_SCHOOL_ID).lean<LeanSettings>();
      if (!doc) throw new NotFoundError('Настройки школы не найдены. Повторите запрос.');
      return toSchoolSettings(doc);
    }
  }
}
