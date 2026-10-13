// Тело `PUT …/:id/poster` (ADR-0182). В отличие от complete (complete-video-upload.dto.ts)
// кадр здесь обязателен: другого смысла у запроса нет. Длина base64 ограничена до
// того, как строка попадёт в память целиком; JPEG и точный размер проверяет
// parseVideoPoster (video-poster.ts).
import { IsBase64, IsNotEmpty, MaxLength } from 'class-validator';
import { VIDEO_POSTER_LIMITS, type SetVideoPosterInput } from '@xuanxue/shared';

export class SetVideoPosterDto implements SetVideoPosterInput {
  @IsNotEmpty()
  @IsBase64()
  @MaxLength(VIDEO_POSTER_LIMITS.maxBase64Length)
  poster!: string;
}
