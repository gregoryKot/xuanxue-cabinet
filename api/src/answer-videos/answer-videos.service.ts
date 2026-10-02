// GET /answer-videos/:id (ADR-0137) — редирект на подписанную ссылку R2,
// тем же приёмом, что ExamVideosService.signedUrl. Доступ: владелец видео
// или штат школы; статус обязан быть `ready` — недогруженное показывать
// нечего (SECURITY §3: чужому и несуществующему id один и тот же отказ).
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import { ANSWER_VIDEO_NOT_FOUND_MESSAGE, isStaffRole } from '@xuanxue/shared';
import { assertObjectId } from '../common/object-id';
import { NotFoundError } from '../common/errors';
import { VIEW_VIDEO, videoDownload, type VideoUrlOptions } from '../common/video-link';
import { FileStoreService } from '../storage/file-store.service';
import type { UserLean } from '../users/users.service';
import type { RawLeanAnswerVideo } from './answer-video.mapper';
import { AnswerVideoRecord } from './answer-video.schema';

// Тот же срок, что у видео вопроса (ExamVideosService) — плеер докачивает
// range-запросами по одной ссылке всё время просмотра/перемотки.
const SIGNED_URL_TTL_SECONDS = 3600;

@Injectable()
export class AnswerVideosService {
  constructor(
    @InjectModel(AnswerVideoRecord.name) private readonly model: Model<AnswerVideoRecord>,
    private readonly fileStore: FileStoreService,
  ) {}

  async signedUrl(
    id: string,
    user: UserLean,
    now: DateTime,
    options: VideoUrlOptions = VIEW_VIDEO,
  ): Promise<string> {
    assertObjectId(id, ANSWER_VIDEO_NOT_FOUND_MESSAGE);
    const doc = await this.model.findById(id).lean<RawLeanAnswerVideo | null>();
    if (!doc || doc.status !== 'ready') {
      throw new NotFoundError(ANSWER_VIDEO_NOT_FOUND_MESSAGE);
    }
    if (!isStaffRole(user.roles) && doc.userId.toString() !== user.id) {
      throw new NotFoundError(ANSWER_VIDEO_NOT_FOUND_MESSAGE);
    }
    return this.fileStore.signedGetUrl(
      doc.key,
      SIGNED_URL_TTL_SECONDS,
      now,
      videoDownload(options, doc.contentType),
    );
  }
}
