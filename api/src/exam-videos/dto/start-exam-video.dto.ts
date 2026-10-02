// Тело POST /exam-videos/uploads (ADR-0165). Предел отпечатка общий с
// видео-ответом: оба уходят в одно ядро video-uploads/.
import { IsInt, IsString, Max, MaxLength, Min } from 'class-validator';
import {
  ANSWER_VIDEO_LIMITS,
  EXAM_VIDEO_LIMITS,
  type ApiRouteBody,
} from '@xuanxue/shared';

export class StartExamVideoDto implements ApiRouteBody<'POST /exam-videos/uploads'> {
  @IsInt()
  @Min(1)
  @Max(EXAM_VIDEO_LIMITS.maxBytes)
  sizeBytes!: number;

  @IsString()
  @MaxLength(ANSWER_VIDEO_LIMITS.fingerprint)
  fingerprint!: string;
}
