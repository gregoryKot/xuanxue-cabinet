// Тело POST /attempts/:id/media/manual (ADR-0023, третий путь — учитель
// отмечает «видео принято»). `note` необязателен — учитель может отметить и
// без комментария, сервис хранит запись без подписи.
import { IsString, MaxLength } from 'class-validator';
import { EXAM_MEDIA_LIMITS, type AddExamMediaManualInput } from '@xuanxue/shared';
import { OptionalNotNull, TrimString } from '../../common/validation';

export class AddExamMediaManualDto implements AddExamMediaManualInput {
  @OptionalNotNull()
  @TrimString()
  @IsString()
  @MaxLength(EXAM_MEDIA_LIMITS.note)
  note?: string;
}
