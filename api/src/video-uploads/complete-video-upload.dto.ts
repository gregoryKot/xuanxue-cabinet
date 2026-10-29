// Тело `POST …/complete` всех видов видео (ADR-0165). Кадр необязателен; длина
// base64 ограничена до того, как строка попадёт в память целиком, а JPEG и
// точный размер проверяет parseVideoPoster (video-poster.ts). Кодек (ADR-0189) —
// тоже необязателен и только из списка: его называет браузер, и права он не даёт.
import { IsBase64, IsIn, IsOptional, MaxLength } from 'class-validator';
import {
  VIDEO_CODECS,
  VIDEO_POSTER_LIMITS,
  type CompleteVideoUploadInput,
  type VideoCodec,
} from '@xuanxue/shared';

export class CompleteVideoUploadDto implements CompleteVideoUploadInput {
  @IsOptional()
  @IsBase64()
  @MaxLength(VIDEO_POSTER_LIMITS.maxBase64Length)
  poster?: string;

  @IsOptional()
  @IsIn(VIDEO_CODECS)
  codec?: VideoCodec;
}
