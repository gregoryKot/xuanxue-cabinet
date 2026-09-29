// Тело POST /attempts/:id/answer-video (ADR-0137).
import { IsInt, IsMongoId, IsString, Max, MaxLength, Min } from 'class-validator';
import { ANSWER_VIDEO_LIMITS, type ApiRouteBody } from '@xuanxue/shared';

export class StartAnswerVideoDto implements ApiRouteBody<'POST /attempts/:id/answer-video'> {
  @IsMongoId()
  itemId!: string;

  @IsInt()
  @Min(1)
  @Max(ANSWER_VIDEO_LIMITS.maxBytes)
  sizeBytes!: number;

  @IsString()
  @MaxLength(ANSWER_VIDEO_LIMITS.fingerprint)
  fingerprint!: string;
}
