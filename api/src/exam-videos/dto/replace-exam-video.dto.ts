// Тело `POST /exam-videos/:id/replace` (ADR-0189). Формат id не проверяем здесь: кривую
// строку отвергает сервис тем же текстом, что и несуществующее видео (EXAM_VIDEO_NOT_FOUND),
// как у вопроса с видео.
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import type { ReplaceExamVideoInput } from '@xuanxue/shared';

// ObjectId — 24 знака; запас, чтобы длинная строка не доезжала до базы.
const MAX_ID_LENGTH = 64;

export class ReplaceExamVideoDto implements ReplaceExamVideoInput {
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_ID_LENGTH)
  replacementId!: string;
}
