// Отдача видео записи занятия: подписанная ссылка и кадр-превью (ADR-0180). Байты
// идут в R2, а не в MongoDB и не через наш инстанс (ADR-0057). Загрузка частями —
// lesson-video-uploads.service.ts (ADR-0165). Кому и какое видео можно брать по id,
// и готово ли оно, — lesson-video-access.ts.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { LessonRecord } from '../lessons/lesson.schema';
import { FileStoreService } from '../storage/file-store.service';
import type { UserLean } from '../users/users.service';
import { SignedVideoService } from '../video-uploads/signed-video.service';
import { assertLessonVideoReady, loadAccessibleLessonVideo } from './lesson-video-access';
import type { RawLeanLessonVideo } from './lesson-video.mapper';
import { LessonVideoRecord } from './lesson-video.schema';

@Injectable()
export class LessonVideosService extends SignedVideoService<
  UserLean,
  RawLeanLessonVideo
> {
  constructor(
    @InjectModel(LessonVideoRecord.name) private readonly model: Model<LessonVideoRecord>,
    @InjectModel(LessonRecord.name) private readonly lessonModel: Model<LessonRecord>,
    fileStore: FileStoreService,
  ) {
    super(fileStore);
  }

  /** Для LessonsService.addRecording: видео с таким id есть и готово. */
  assertReady(id: string): Promise<void> {
    return assertLessonVideoReady(this.model, id);
  }

  protected loadAccessibleDoc(
    id: string,
    user: UserLean,
    fields?: string,
  ): Promise<RawLeanLessonVideo> {
    const { model, lessonModel } = this;
    return loadAccessibleLessonVideo({ model, lessonModel }, id, user, fields);
  }
}
