// Тело POST /lesson-videos/uploads (ADR-0180). Предел отпечатка общий с остальными
// видами видео: все уходят в одно ядро video-uploads/.
import { IsInt, IsString, Max, MaxLength, Min } from 'class-validator';
import {
  ANSWER_VIDEO_LIMITS,
  LESSON_VIDEO_LIMITS,
  type ApiRouteBody,
} from '@xuanxue/shared';

export class StartLessonVideoDto implements ApiRouteBody<'POST /lesson-videos/uploads'> {
  @IsInt()
  @Min(1)
  @Max(LESSON_VIDEO_LIMITS.maxBytes)
  sizeBytes!: number;

  @IsString()
  @MaxLength(ANSWER_VIDEO_LIMITS.fingerprint)
  fingerprint!: string;
}
