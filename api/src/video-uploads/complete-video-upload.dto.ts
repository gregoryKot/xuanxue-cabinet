// Тело `POST …/complete` обоих видов видео (ADR-0165). Кадр необязателен; длина
// base64 ограничена до того, как строка попадёт в память целиком, а JPEG и
// точный размер проверяет parseVideoPoster (video-poster.ts).
import { IsBase64, IsOptional, MaxLength } from 'class-validator';
import { VIDEO_POSTER_LIMITS, type CompleteVideoUploadInput } from '@xuanxue/shared';

export class CompleteVideoUploadDto implements CompleteVideoUploadInput {
  @IsOptional()
  @IsBase64()
  @MaxLength(VIDEO_POSTER_LIMITS.maxBase64Length)
  poster?: string;
}
