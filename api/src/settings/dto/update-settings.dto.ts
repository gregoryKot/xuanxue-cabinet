// Тело PATCH /settings — шаблоны школы (docs/PLAN.md §6 «Шаблоны»). Ключи API
// (`lesson_link`, `recording`) — литералы полей класса, не Record<string,…>:
// class-validator не умеет провалидировать произвольный набор ключей, а
// шаблонов у школы ровно два (TEMPLATE_KINDS, shared/src/default-templates.ts).
// Без TrimString(): у шаблона бывают значимые переводы строк по краям
// (образец — DEFAULT_TEMPLATES.lesson_link начинается с необязательного
// фрагмента, за которым явный `\n`) — обрезка молча испортила бы вёрстку
// поста. «Не пустой» проверяем отдельно — `\S` где-то в строке, не сам факт
// непустой длины (иначе шаблон из одних пробелов/переводов строк прошёл бы).
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SETTINGS_LIMITS, type UpdateSettingsInput } from '@xuanxue/shared';
import { OptionalNotNull } from '../../common/validation';

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

export class UpdateSettingsDto implements UpdateSettingsInput {
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateTemplatesDto)
  templates?: UpdateTemplatesDto;
}
