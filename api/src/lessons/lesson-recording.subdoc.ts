// Запись занятия как субдокумент `lessons.recordings` — вынесена из lesson.schema.ts
// (файл-храповик CLAUDE.md «Храповики»: схема занятия на границе 150 строк). Решения о
// шифровании полей записи — LESSON_FIELD_POLICY рядом со схемой занятия.
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { Recording } from '@xuanxue/shared';

@Schema({ _id: true })
class RecordingSubdoc implements Recording {
  @Prop({ type: String, required: true })
  title!: string;

  @Prop({ type: String, required: false })
  url?: string;

  @Prop({ type: String, required: false })
  telegramFileId?: string;

  // id видео записи (`lesson_videos`, ADR-0180) — строкой, как `exam_items.videoId`.
  // Файл, ссылка и file_id живут вместе: одна запись — один пост.
  @Prop({ type: String, required: false })
  videoId?: string;
}

export const RecordingSchema = SchemaFactory.createForClass(RecordingSubdoc);
