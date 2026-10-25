// Настройки школы (данные школы, ADR-0010) — один документ на всю систему
// (docs/PLAN.md §4). Фиксированный `_id: 'school'` вместо ObjectId: школа
// одна, второй документ этой коллекции появиться не должен и не может —
// SettingsService.get() всегда upsert по этому же id.
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SCHOOL_TZ } from '@xuanxue/shared';
import { plain, type FieldPolicy } from '../common/field-policy';
import {
  SettingsBoardNoticeSchema,
  type SettingsBoardNoticeSubdoc,
} from './settings-board-notice.schema';

export const SETTINGS_SCHOOL_ID = 'school';

// Подсхема, не Mixed (CLAUDE.md — Mixed только с причиной, здесь причины
// нет: у объекта ровно два постоянных поля, а не произвольная форма).
@Schema({ _id: false })
class SettingsTemplatesSubdoc {
  @Prop({ type: String, required: true })
  lessonLink!: string;

  @Prop({ type: String, required: true })
  recording!: string;
}
const SettingsTemplatesSchema = SchemaFactory.createForClass(SettingsTemplatesSubdoc);

// Напоминание об оплате (ADR-0051). Подсхема, не Mixed: набор полей
// постоянный. У полей нет ни `required`, ни `default`: старая база не имеет
// подобъекта вовсе, а `$set` по точечному пути `paymentReminder.enabled`
// создаёт его только с одним полем — недостающее подставляет маппер
// (toSettingsDto) из DEFAULT_PAYMENT_REMINDER, а не Mongoose.
@Schema({ _id: false })
class SettingsPaymentReminderSubdoc {
  @Prop({ type: Boolean })
  enabled?: boolean;

  @Prop({ type: String })
  time?: string;

  @Prop({ type: String })
  template?: string;
}
const SettingsPaymentReminderSchema = SchemaFactory.createForClass(
  SettingsPaymentReminderSubdoc,
);

@Schema({ timestamps: true, collection: 'settings', _id: false })
export class SettingsRecord {
  @Prop({ type: String, required: true, default: SETTINGS_SCHOOL_ID })
  _id!: string;

  @Prop({ type: SettingsTemplatesSchema, required: true })
  templates!: SettingsTemplatesSubdoc;

  @Prop({ type: String, required: true, default: SCHOOL_TZ })
  tz!: string;

  // Не required и без default: пока учитель не заполнил экран «Шаблоны»,
  // поля просто нет (В6 аудита) — GET /auth/config тогда не показывает
  // ссылку никому, а не отдаёт пустую строку как настоящий адрес.
  @Prop({ type: String })
  schoolSiteUrl?: string;

  // Тоже не required и без default: старая база до этой настройки не имеет
  // поля вовсе — settings.service.ts подставляет DEFAULT_PREVIEW_MINUTES
  // явно при чтении (toSettingsDto), не полагаясь на Mongoose-default,
  // который `.lean()` не применяет к уже существующим документам.
  @Prop({ type: Number })
  previewMinutes?: number;

  // Не required и без default по той же причине, что и previewMinutes:
  // старая база до этой настройки (ADR-0135) не имеет поля вовсе —
  // settings.service.ts подставляет DEFAULT_LESSON_REMINDER_MINUTES явно при
  // чтении (toSettingsDto).
  @Prop({ type: Number })
  lessonReminderMinutes?: number;

  // Не required и без default по той же причине, что и previewMinutes:
  // старая база без этой настройки не имеет поля вовсе — дефолт
  // (DEFAULT_NEWCOMER_CONTACT) подставляется явно при чтении (toSettingsDto).
  @Prop({ type: String })
  newcomerContact?: string;

  // Не required и без default, как newcomerContact: старая база без поля —
  // дефолт (DEFAULT_PAYMENT_CONTACT) подставляется явно при чтении
  // (toSettingsDto, ADR-0159).
  @Prop({ type: String })
  paymentContact?: string;

  // Не required и без default: пока школа не назвала ответственного, полей
  // просто нет, и страница /privacy честно отправляет к учителю, а не
  // показывает пустое имя (GET /auth/config отдаёт их только когда они есть).
  @Prop({ type: String })
  dataControllerName?: string;

  @Prop({ type: String })
  dataControllerContact?: string;

  // Не required и без default по той же причине, что и previewMinutes:
  // старая база без настройки не имеет подобъекта — дефолт
  // (DEFAULT_PAYMENT_REMINDER) подставляется при чтении (toSettingsDto).
  @Prop({ type: SettingsPaymentReminderSchema })
  paymentReminder?: SettingsPaymentReminderSubdoc;

  // Не required и без default: пока учитель не написал объявление, поля нет, и
  // `GET /me/board` отдаёт `notice: null` (ADR-0172).
  @Prop({ type: SettingsBoardNoticeSchema })
  boardNotice?: SettingsBoardNoticeSubdoc;
}

export const SettingsSchema = SchemaFactory.createForClass(SettingsRecord);

export const SETTINGS_FIELD_POLICY: FieldPolicy = {
  'templates.lessonLink': plain('текст поста пишет учитель, публикуется как есть'),
  'templates.recording': plain('текст поста пишет учитель, публикуется как есть'),
  tz: plain('часовой пояс школы, нужен для выборок'),
  schoolSiteUrl: plain(
    'публичный адрес сайта школы — отдаётся всем через GET /auth/config',
  ),
  newcomerContact: plain(
    'текст публичный — бот называет этот контакт незнакомцу (ADR-0115)',
  ),
  paymentContact: plain(
    'текст публичный для учеников — контакт бухгалтера, куда присылают скриншот перевода (ADR-0159)',
  ),
  dataControllerName: plain(
    'публичный текст — школа сама называет, кто отвечает за данные; отдаётся всем через GET /auth/config',
  ),
  dataControllerContact: plain(
    'публичный текст — контакт для запросов о данных; отдаётся всем через GET /auth/config',
  ),
  'paymentReminder.template': plain(
    'текст пишет учитель, уходит ученику как есть — данных ученика в нём нет, они подставляются при отправке (ADR-0051)',
  ),
  'boardNotice.text': plain(
    'текст пишет учитель и показывает всем ученикам на доске как есть — персональных данных в нём нет (ADR-0172)',
  ),
  'boardNotice.until': plain('дата «YYYY-MM-DD» — последний день показа, нужна выборке'),
  'paymentReminder.time': plain('время суток «HH:mm» в поясе школы, нужно планировщику'),
};
