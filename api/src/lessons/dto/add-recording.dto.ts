// Тело POST /lessons/:id/recording. «Хотя бы одно из url/telegramFileId» —
// проверка в сервисе: class-validator валидирует каждое поле по отдельности,
// не связку двух необязательных полей.
import { IsString, IsUrl, MaxLength } from 'class-validator';
import { LESSON_LIMITS, type AddRecordingInput } from '@xuanxue/shared';
import { OptionalNotNull, TrimString } from '../../common/validation';

export class AddRecordingDto implements AddRecordingInput {
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
}
