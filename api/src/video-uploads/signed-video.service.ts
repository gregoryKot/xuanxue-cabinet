// Отдача видео школы (вопроса, записи занятия): подписанная ссылка и кадр-превью
// с проверкой доступа своего вида (ExamVideosService, дальше — другие виды видео школы). Одна
// механика в одном месте (CLAUDE.md «Одна механика — один компонент»): наследник
// говорит только, КОМУ и КАКОЕ видео можно брать по id (`loadAccessibleDoc`),
// остальное — ссылка на R2 и кадр — общее. Байты идут в R2, а не через наш
// инстанс (ADR-0057).
import type { DateTime } from 'luxon';
import type { VideoAccess } from '../common/video-redirect';
import { VIEW_VIDEO, signedVideoUrl, type VideoUrlOptions } from '../common/video-link';
import type { FileStoreService } from '../storage/file-store.service';
import { readPoster } from './video-poster';

/** Что нужно от документа видео, чтобы подписать ссылку и отдать кадр. */
interface SignedVideoDoc {
  key: string;
  contentType?: string;
  poster?: unknown;
}

/** `U` — тип пользователя сессии (`UserLean`), параметром: видео-ядро не знает
 * домена пользователей. */
export abstract class SignedVideoService<
  U,
  Doc extends SignedVideoDoc,
> implements VideoAccess<U> {
  protected constructor(protected readonly fileStore: FileStoreService) {}

  /** Права и готовность: чужому, не готовому и несуществующему — один и тот же
   * NotFoundError (SECURITY §3). `fields: '+poster'` — кадр с `select: false`
   * (video-upload.schema.ts) читается, только когда его просят. */
  protected abstract loadAccessibleDoc(
    id: string,
    user: U,
    fields?: string,
  ): Promise<Doc>;

  async signedUrl(
    id: string,
    user: U,
    now: DateTime,
    options: VideoUrlOptions = VIEW_VIDEO,
  ): Promise<string> {
    const doc = await this.loadAccessibleDoc(id, user);
    return signedVideoUrl({ fileStore: this.fileStore, doc, now, options });
  }

  /** Кадр-превью — те же права, что у видео (ADR-0165). */
  async loadPoster(id: string, user: U): Promise<Buffer | null> {
    return readPoster(await this.loadAccessibleDoc(id, user, '+poster'));
  }
}
