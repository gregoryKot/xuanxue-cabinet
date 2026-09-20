// Поля, общие для тела POST и PATCH /classes (создание и правка одной
// формой). `title`/`format`/`location`/`zoomLink`/`zoomPassword`/`leaderId`
// сюда НЕ входят — они либо меняют обязательность (title, format), либо тип
// (остальные допускают `null` только в PATCH), а метаданные декораторов
// class-validator наследуются по прототипу: родительский декоратор с этой
// базы остался бы действовать и на переопределённом поле подкласса.
//
// Ни одно из полей ниже не входит в NULLABLE_CLASS_FIELDS (shared) — `null`
// для них ошибка формы, а не «сбросить», поэтому `@IsOptional()` заменён на
// `OptionalNotNull()`: пропускает `undefined`, `null` доходит до остальных
// декораторов и получает 400 (CLAUDE.md, раздел «API»). Исключение — `tags`
// ниже: тот же `@IsOptional()`, что у CreateLessonDto/UpdateLessonDto.tags
// (ADR-0059) — поле тоже не в NULLABLE_CLASS_FIELDS, но сервис трогает его,
// только если оно вообще прислано (ClassesService, тот же приём, что у
// MaterialsService.update), а не по признаку «не null».
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  IsTimeZone,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CLASS_LIMITS, TAG_LIMITS, type ScheduleRuleInput } from '@xuanxue/shared';
import { OptionalNotNull } from '../../common/validation';
import { ruleUniqueKey } from '../classes.update';
import { ScheduleRuleDto } from './schedule-rule.dto';

const MIN_LEAD_MINUTES = 0;

export class ClassFieldsDto {
  @OptionalNotNull()
  @IsString()
  @MaxLength(CLASS_LIMITS.groupLabel)
  groupLabel?: string;

  @OptionalNotNull()
  @IsArray()
  @ArrayMaxSize(CLASS_LIMITS.rulesMax)
  @ArrayUnique(ruleUniqueKey)
  @ValidateNested({ each: true })
  @Type(() => ScheduleRuleDto)
  rules?: ScheduleRuleInput[];

  @OptionalNotNull()
  @IsTimeZone()
  tz?: string;

  @OptionalNotNull()
  @IsArray()
  @ArrayMaxSize(CLASS_LIMITS.channelsMax)
  @IsMongoId({ each: true })
  channelIds?: string[];

  @OptionalNotNull()
  @IsInt()
  @Min(MIN_LEAD_MINUTES)
  @Max(CLASS_LIMITS.leadMinutesMax)
  leadMinutes?: number;

  @OptionalNotNull()
  @IsBoolean()
  active?: boolean;

  // Постоянный признак курса, не вечера (ADR-0072) — нормализация (обрезка,
  // дедуп без учёта регистра), только если поле прислали, — ClassesService.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(TAG_LIMITS.perRecord)
  @IsString({ each: true })
  @MaxLength(TAG_LIMITS.length, { each: true })
  tags?: string[];
}
