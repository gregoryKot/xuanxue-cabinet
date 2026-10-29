// «Перегнать видео» для старых видео вопросов (ADR-0189): список тех, что не в H.264,
// запись кодека, который браузер штата прочитал из байтов, и подмена файла перегнанным.
// Сервис про школу, а не про одного человека: роль проверяет контроллер, выборки от
// пользователя не зависят.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import {
  EXAM_VIDEO_NOT_FOUND_MESSAGE,
  VIDEOS_CODEC_PENDING_BATCH,
  type ExamVideoDto,
  type VideoCodec,
} from '@xuanxue/shared';
import { NotFoundError } from '../common/errors';
import { assertObjectId } from '../common/object-id';
import { ExamAttemptRecord } from '../exams/exam-attempt.schema';
import { ExamItemRecord } from '../exams/exam-item.schema';
import { StorageOrphansService } from '../storage/storage-orphans.service';
import { findVideosCodecPending } from '../video-uploads/video-codec';
import { replaceExamVideo } from './exam-video-replace';
import {
  EXAM_VIDEO_READY_FILTER,
  toExamVideoDto,
  type RawLeanExamVideo,
} from './exam-video.mapper';
import { ExamVideoRecord } from './exam-video.schema';

@Injectable()
export class ExamVideoTranscodeService {
  constructor(
    @InjectModel(ExamVideoRecord.name) private readonly model: Model<ExamVideoRecord>,
    @InjectModel(ExamItemRecord.name) private readonly itemModel: Model<ExamItemRecord>,
    @InjectModel(ExamAttemptRecord.name)
    private readonly attemptModel: Model<ExamAttemptRecord>,
    private readonly orphans: StorageOrphansService,
  ) {}

  /** Готовые видео не в H.264, пачкой, старые первыми. Видео без записанного кодека
   * тоже здесь: кодек они получат от браузера штата, когда тот их прочитает. */
  async listPending(): Promise<ExamVideoDto[]> {
    const docs = await findVideosCodecPending<ExamVideoRecord, RawLeanExamVideo>(
      this.model,
      EXAM_VIDEO_READY_FILTER,
      VIDEOS_CODEC_PENDING_BATCH,
    );
    return docs.map(toExamVideoDto);
  }

  /** Кодек, прочитанный браузером штата из байтов, — истина: перетирает записанный
   * при загрузке. Не готовому и несуществующему видео — тот же 404, что у чтения. */
  async setCodec(id: string, codec: VideoCodec): Promise<ExamVideoDto> {
    assertObjectId(id, EXAM_VIDEO_NOT_FOUND_MESSAGE);
    const doc = await this.model
      .findOneAndUpdate(
        { _id: id, ...EXAM_VIDEO_READY_FILTER },
        { $set: { videoCodec: codec } },
        { returnDocument: 'after' },
      )
      .lean<RawLeanExamVideo | null>();
    if (!doc) throw new NotFoundError(EXAM_VIDEO_NOT_FOUND_MESSAGE);
    return toExamVideoDto(doc);
  }

  /** Подменить файл видео перегнанным; порядок шагов и почему он безопасен — в
   * exam-video-replace.ts. Исходный файл остаётся в `originalKey`. */
  replace(id: string, replacementId: string, now: DateTime): Promise<ExamVideoDto> {
    const { model, itemModel, attemptModel, orphans } = this;
    return replaceExamVideo(
      { model, itemModel, attemptModel, orphans },
      { targetId: id, replacementId, now },
    );
  }
}
