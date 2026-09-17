// Вариант ответа в теле POST/PATCH /exam-items — одна форма для создания и
// правки: правка options всегда заменяет набор целиком (в отличие от правил
// расписания у занятий, у варианта своего входного `id` нет, см.
// exam-item-options.ts/mapOptions). Сочетание полей — «текст или картинка
// обязательны, как минимум число вариантов» — проверяет сервис
// (assertOptionsForKind, exam-item-options.ts), не DTO: здесь только форма
// и тип каждого поля по отдельности.
import { IsBoolean, IsMongoId, IsOptional, IsString, MaxLength } from 'class-validator';
import { EXAM_ITEM_LIMITS, type ExamItemOptionInput } from '@xuanxue/shared';
import { TrimString } from '../../common/validation';

export class ExamItemOptionDto implements ExamItemOptionInput {
  @IsOptional()
  @IsMongoId()
  id?: string;

  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(EXAM_ITEM_LIMITS.optionText)
  text?: string;

  @IsOptional()
  @IsBoolean()
  correct?: boolean;

  // Картинка варианта (ADR-0035) — ссылка на уже загруженную запись
  // exam_images (`POST /exam-images`), не сами байты.
  @IsOptional()
  @IsMongoId()
  imageId?: string;
}
