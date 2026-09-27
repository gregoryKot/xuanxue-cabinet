// Вариант ответа в теле POST/PATCH /exam-items — одна форма для создания и
// правки: правка options всегда заменяет набор целиком (в отличие от правил
// расписания у занятий, у варианта своего входного `id` нет, см.
// exam-item-options.ts/mapOptions). Сочетание полей — «текст или картинка
// обязательны, как минимум число вариантов» — проверяет сервис
// (assertOptionsForKind, exam-item-options.ts), не DTO: здесь только форма
// и тип каждого поля по отдельности.
import {
  IsBoolean,
  IsMongoId,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
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

  // Видео варианта (ADR-0133) — ссылка на уже загруженную запись exam_videos
  // (`POST /exam-videos`), не сами байты. Сочетание с imageId/videoUrl —
  // проверяет сервис (assertOptionsForKind, OPTION_ONE_MEDIA_MESSAGE).
  @IsOptional()
  @IsMongoId()
  videoId?: string;

  // https-ссылка на видео варианта (YouTube и т.п., без R2) — тот же
  // валидатор, что у ссылки записи/материала (@IsUrl, class-validator);
  // второй ссылочный валидатор не заводим (CLAUDE.md «Одна механика»).
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(EXAM_ITEM_LIMITS.videoUrl)
  videoUrl?: string;
}
