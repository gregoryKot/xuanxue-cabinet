// Тело PATCH /settings — шаблоны школы (docs/PLAN.md §6 «Шаблоны»). Ключи API
// (`lesson_link`, `recording`) — литералы полей класса, не Record<string,…>:
// class-validator не умеет провалидировать произвольный набор ключей, а
// шаблонов у школы ровно два (TEMPLATE_KINDS, shared/src/default-templates.ts).
// Без TrimString(): у шаблона бывают значимые переводы строк по краям
// (образец — DEFAULT_TEMPLATES.lesson_link начинается с необязательного
// фрагмента, за которым явный `\n`) — обрезка молча испортила бы вёрстку
// поста. «Не пустой» проверяем отдельно — `\S` где-то в строке, не сам факт
// непустой длины (иначе шаблон из одних пробелов/переводов строк прошёл бы).
// schoolSiteUrl — адрес сайта школы (В6 аудита, ADR-0009-доп.): nullable-поле,
// `null` снимает настройку (NULLABLE_SETTINGS_FIELDS, settings.service.ts).
// newcomerContact — кому писать незнакомцу (ADR-0115): не nullable, пустая
// строка не проходит (`\S`) — иначе бот оборвал бы фразу «Напишите …» на
// полуслове.
// dataControllerName/Contact — кто отвечает за данные учеников (страница
// /privacy): nullable, `null` снимает поле; пустота и одни пробелы не проходят
// (`\S` после обрезки) — иначе на странице вместо «спросите учителя» пусто.
// paymentReminder — напоминание ученику об оплате (ADR-0051): вложенный
// объект, PATCH меняет только переданные поля (settings-payment-reminder.ts).
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  RULE_TIME_RE,
  SETTINGS_LIMITS,
  type ApiRouteBody,
  type PaymentReminderSettings,
} from '@xuanxue/shared';
import { OptionalNotNull, TrimString } from '../../common/validation';

// Продолжение фразы «Шаблон «…»: …» (validation-messages.ts) — без повтора
// слова «Шаблон», дефолтное сообщение matches ничего не сказало бы про
// пустоту (regex тут — способ проверки, не смысл ограничения).
const NOT_EMPTY_MESSAGE = 'не может быть пустым.';

// export: field-labels-coverage.spec.ts сверяет её поля отдельно от
// UpdateSettingsDto — как вложенный класс `@ValidateNested()` она не
// проверяется через инспекцию UpdateSettingsDto напрямую (см. комментарий
// там же).
export class UpdateTemplatesDto {
  @OptionalNotNull()
  @IsString()
  @Matches(/\S/, { message: NOT_EMPTY_MESSAGE })
  @MaxLength(SETTINGS_LIMITS.templateMaxLength)
  lesson_link?: string;

  @OptionalNotNull()
  @IsString()
  @Matches(/\S/, { message: NOT_EMPTY_MESSAGE })
  @MaxLength(SETTINGS_LIMITS.templateMaxLength)
  recording?: string;
}

// export: та же причина, что у UpdateTemplatesDto выше. Ни одно поле не
// nullable: «сбросить в ничто» у включателя, времени и текста смысла не
// имеет, только заменить другим значением.
export class UpdatePaymentReminderDto implements Partial<PaymentReminderSettings> {
  @OptionalNotNull()
  @IsBoolean()
  enabled?: boolean;

  // Продолжение фразы «Время: …» (validation-messages.ts), как в
  // schedule-rule.dto.ts.
  @OptionalNotNull()
  @Matches(RULE_TIME_RE, { message: 'в формате ЧЧ:ММ, например 10:00.' })
  time?: string;

  @OptionalNotNull()
  @IsString()
  @Matches(/\S/, { message: NOT_EMPTY_MESSAGE })
  @MaxLength(SETTINGS_LIMITS.templateMaxLength)
  template?: string;
}

export class UpdateSettingsDto implements ApiRouteBody<'PATCH /settings'> {
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateTemplatesDto)
  templates?: UpdateTemplatesDto;

  // `null` — явный сброс (В6 аудита: пустое поле формы значит «сайта нет»,
  // не «оставить как было»), поэтому `@IsOptional()` — она, в отличие от
  // OptionalNotNull(), пропускает и undefined, и null (та же пара декораторов,
  // что у zoomLink в update-class.dto.ts).
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(SETTINGS_LIMITS.schoolSiteUrlMaxLength)
  schoolSiteUrl?: string | null;

  // Не в NULLABLE_SETTINGS_FIELDS — «сбросить в ничто» здесь смысла не
  // имеет (в отличие от schoolSiteUrl): OptionalNotNull() пропускает
  // undefined, но null проваливается в @IsInt() и получает 400, как у
  // leadMinutes в class-fields.dto.ts.
  @OptionalNotNull()
  @IsInt()
  @Min(SETTINGS_LIMITS.previewMinutesMin)
  @Max(SETTINGS_LIMITS.previewMinutesMax)
  previewMinutes?: number;

  // Не в NULLABLE_SETTINGS_FIELDS — та же причина, что у previewMinutes
  // выше: «сбросить в ничто» смысла не имеет, только заменить другим числом.
  @OptionalNotNull()
  @IsInt()
  @Min(SETTINGS_LIMITS.lessonReminderMinutesMin)
  @Max(SETTINGS_LIMITS.lessonReminderMinutesMax)
  lessonReminderMinutes?: number;

  @OptionalNotNull()
  @IsString()
  @Matches(/\S/, { message: NOT_EMPTY_MESSAGE })
  @MaxLength(SETTINGS_LIMITS.newcomerContactMaxLength)
  newcomerContact?: string;

  // Кому присылать скриншот перевода (ADR-0159): те же правила, что у
  // newcomerContact, — пустая строка оборвала бы фразу в напоминании.
  @OptionalNotNull()
  @IsString()
  @Matches(/\S/, { message: NOT_EMPTY_MESSAGE })
  @MaxLength(SETTINGS_LIMITS.paymentContactMaxLength)
  paymentContact?: string;

  @IsOptional()
  @TrimString()
  @IsString()
  @Matches(/\S/, { message: NOT_EMPTY_MESSAGE })
  @MaxLength(SETTINGS_LIMITS.dataControllerNameMaxLength)
  dataControllerName?: string | null;

  @IsOptional()
  @TrimString()
  @IsString()
  @Matches(/\S/, { message: NOT_EMPTY_MESSAGE })
  @MaxLength(SETTINGS_LIMITS.dataControllerContactMaxLength)
  dataControllerContact?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdatePaymentReminderDto)
  paymentReminder?: UpdatePaymentReminderDto;
}
