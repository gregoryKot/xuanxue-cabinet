// Тело POST /lessons/:id/recording. «Хотя бы одно из url/telegramFileId/videoId» —
// проверка в сервисе: class-validator валидирует каждое поле по отдельности,
// не связку двух необязательных полей.
import { IsMongoId, IsString, IsUrl, MaxLength } from 'class-validator';
import { LESSON_LIMITS, type ApiRouteBody } from '@xuanxue/shared';
import { OptionalNotNull, TrimString } from '../../common/validation';

export class AddRecordingDto implements ApiRouteBody<'POST /lessons/:id/recording'> {
  @OptionalNotNull()
  @TrimString()
  @IsString()
  @MaxLength(LESSON_LIMITS.recordingTitle)
  title?: string;

  @OptionalNotNull()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(LESSON_LIMITS.url)
  url?: string;

  @OptionalNotNull()
  @IsString()
  @MaxLength(LESSON_LIMITS.telegramFileId)
  telegramFileId?: string;

  // Готовое видео из `POST /lesson-videos/…` (ADR-0180); что оно есть и готово,
  // проверяет LessonsService.addRecording.
  @OptionalNotNull()
  @IsMongoId()
  videoId?: string;
}
