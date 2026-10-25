// Вложенный объект `boardNotice` тела PATCH /settings — объявление на доске
// ученика (ADR-0172). Оба поля обязательны: текст без срока висел бы вечно,
// срок без текста показывал бы пустую плашку. Обрезка пробелов до проверок —
// иначе «   » прошло бы как непустой текст. Экспорт нужен
// field-labels-coverage.spec.ts: метаданные вложенного класса лежат под ним.
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import { RULE_DATE_RE, SETTINGS_LIMITS, type BoardNotice } from '@xuanxue/shared';
import { TrimString } from '../../common/validation';

export class BoardNoticeDto implements BoardNotice {
  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(SETTINGS_LIMITS.boardNoticeTextMaxLength)
  text!: string;

  @Matches(RULE_DATE_RE, { message: 'в формате ГГГГ-ММ-ДД, например 2026-10-20.' })
  until!: string;
}
