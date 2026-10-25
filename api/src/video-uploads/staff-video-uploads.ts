// Загрузка видео школы штатом (сейчас видео вопроса, дальше другие виды): часть и
// завершение у всех видов одинаковы, различаются владение загрузкой (`loadOwn`:
// продолжает только тот, кто начал, чужая — 404, SECURITY §3), потолок, каталог
// ключей и DTO ответа — это остаётся в наследнике. Одна механика на все виды
// (CLAUDE.md «Одна механика — один компонент»).
import type { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import type { VideoUploadDto } from '@xuanxue/shared';
import type { RawLeanVideoUpload } from './video-upload.mapper';
import type { VideoUploadRecord } from './video-upload.schema';
import type { VideoUploadsService } from './video-uploads.service';

export abstract class StaffVideoUploads<
  T extends VideoUploadRecord,
  L extends RawLeanVideoUpload,
> {
  protected abstract readonly model: Model<T>;
  protected abstract readonly uploads: VideoUploadsService;

  /** Своя загрузка или 404: чужая и несуществующая отвечают одинаково. */
  protected abstract loadOwn(id: string, userId: string): Promise<L>;

  async uploadPart(
    id: string,
    userId: string,
    partNumber: number,
    body: unknown,
    now: DateTime,
  ): Promise<VideoUploadDto> {
    const doc = await this.loadOwn(id, userId);
    return this.uploads.uploadPart(this.model, { doc, partNumber, body, now });
  }

  /** Завершить свою загрузку; DTO из возвращённой записи строит наследник. */
  protected async completeOwn(
    id: string,
    userId: string,
    now: DateTime,
    posterBase64: string | undefined,
  ): Promise<L> {
    const doc = await this.loadOwn(id, userId);
    return this.uploads.complete(this.model, doc, { posterBase64, now });
  }
}
