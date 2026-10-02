// PUT /answer-videos/:id/parts/:n (ADR-0137) — принять одну часть файла.
// Вынесено из AnswerVideosService (файл-лимит CLAUDE.md «Храповики»). Здесь
// только то, что про ученика: чья это загрузка (SECURITY §3). Сама приёмка
// части — общее ядро video-uploads/ (ADR-0165).
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { DateTime } from 'luxon';
import {
  ANSWER_VIDEO_NOT_FOUND_MESSAGE,
  type AnswerVideoUploadDto,
} from '@xuanxue/shared';
import { assertObjectId } from '../common/object-id';
import { NotFoundError } from '../common/errors';
import { VideoUploadsService } from '../video-uploads/video-uploads.service';
import { AnswerVideoRecord, type RawLeanAnswerVideo } from './answer-video.schema';

@Injectable()
export class AnswerVideoPartService {
  constructor(
    @InjectModel(AnswerVideoRecord.name) private readonly model: Model<AnswerVideoRecord>,
    private readonly uploads: VideoUploadsService,
  ) {}

  async uploadPart(
    id: string,
    userId: string,
    partNumber: number,
    body: unknown,
    now: DateTime,
  ): Promise<AnswerVideoUploadDto> {
    assertObjectId(id, ANSWER_VIDEO_NOT_FOUND_MESSAGE);
    const doc = await this.model.findById(id).lean<RawLeanAnswerVideo | null>();
    if (!doc || doc.userId.toString() !== userId) {
      throw new NotFoundError(ANSWER_VIDEO_NOT_FOUND_MESSAGE);
    }
    return this.uploads.uploadPart(this.model, { doc, partNumber, body, now });
  }
}
