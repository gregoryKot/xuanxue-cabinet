// Тело POST /attempts/:id/media/link (ADR-0023, запасной путь — у кого нет
// Telegram). Схема http/https, длина по лимиту; сообщение — по VOICE, что
// случилось и что сделать дальше, не «неверный формат».
import { IsUrl, MaxLength } from 'class-validator';
import {
  EXAM_MEDIA_INVALID_URL_MESSAGE,
  EXAM_MEDIA_LIMITS,
  type AddExamMediaLinkInput,
} from '@xuanxue/shared';

export class AddExamMediaLinkDto implements AddExamMediaLinkInput {
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { message: EXAM_MEDIA_INVALID_URL_MESSAGE },
  )
  @MaxLength(EXAM_MEDIA_LIMITS.url)
  url!: string;
}
