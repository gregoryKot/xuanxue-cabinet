// Тело `PUT /exam-videos/:id/codec` (ADR-0189). Кодек обязателен: другого смысла у
// запроса нет. Значение только из списка Mediabunny — чужую строку в базу не пускаем.
import { IsIn } from 'class-validator';
import { VIDEO_CODECS, type SetVideoCodecInput, type VideoCodec } from '@xuanxue/shared';

export class SetVideoCodecDto implements SetVideoCodecInput {
  @IsIn(VIDEO_CODECS)
  codec!: VideoCodec;
}
