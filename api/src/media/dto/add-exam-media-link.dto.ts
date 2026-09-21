// Тело POST /attempts/:id/media/link (ADR-0023, запасной путь — у кого нет
// Telegram). Схема http/https, длина по лимиту; сообщение — по VOICE, что
// случилось и что сделать дальше, не «неверный формат».
// `itemId` (ADR-0037) — экран сдачи присылает его всегда (комментарий у
// AddExamMediaLinkInput, shared/src/exam-media.ts); необязательным поле
// осталось ради деплоя expand → contract, пока старый инстанс шлёт без него.
// Сервис проверяет, что это video-вопрос снимка.
import { IsMongoId, IsOptional, IsUrl, MaxLength } from 'class-validator';
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

  @IsOptional()
  @IsMongoId()
  itemId?: string;
}
