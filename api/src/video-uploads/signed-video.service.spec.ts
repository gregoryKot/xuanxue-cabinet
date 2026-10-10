// Общая отдача видео школы: подписанная ссылка и кадр с правами вида. Доступ вида
// (loadAccessibleDoc) здесь заглушён — он проверен в спеках самих видов; проверяется
// склейка: что права спрашиваются у каждого вызова, ссылка подписывается по ключу, а
// «скачать» доходит до подписи.
import { DateTime } from 'luxon';
import { NotFoundError } from '../common/errors';
import type { FileStoreService } from '../storage/file-store.service';
import { SignedVideoService } from './signed-video.service';

const NOW = DateTime.utc(2026, 10, 10, 12, 0, 0);
const POSTER = Buffer.from([0xff, 0xd8, 0xff]);

interface FakeDoc {
  key: string;
  contentType?: string;
  poster?: unknown;
}

class FakeVideos extends SignedVideoService<string, FakeDoc> {
  readonly calls: { id: string; user: string; fields?: string }[] = [];

  constructor(fileStore: FileStoreService) {
    super(fileStore);
  }

  protected loadAccessibleDoc(
    id: string,
    user: string,
    fields?: string,
  ): Promise<FakeDoc> {
    this.calls.push({ id, user, fields });
    if (user !== 'свой') return Promise.reject(new NotFoundError('нет'));
    return Promise.resolve({
      key: `videos/${id}`,
      contentType: 'video/mp4',
      poster: POSTER,
    });
  }
}

describe('SignedVideoService', () => {
  const signedGetUrl = jest.fn(
    (key: string, _ttl: number, _now: DateTime, download?: { name: string }) =>
      `https://r2.example/${key}${download ? `?dl=${download.name}` : ''}`,
  );
  const service = new FakeVideos({ signedGetUrl } as unknown as FileStoreService);

  it('ссылка на просмотр подписывается по ключу видео', async () => {
    await expect(service.signedUrl('a1', 'свой', NOW)).resolves.toBe(
      'https://r2.example/videos/a1',
    );
  });

  it('скачивание доходит до подписи: имя файла по типу видео', async () => {
    await expect(service.signedUrl('a1', 'свой', NOW, { download: true })).resolves.toBe(
      'https://r2.example/videos/a1?dl=video.mp4',
    );
  });

  it('кадр читается явным запросом +poster и отдаётся буфером', async () => {
    const poster = await service.loadPoster('a1', 'свой');

    expect(poster?.equals(POSTER)).toBe(true);
    expect(service.calls.at(-1)).toEqual({ id: 'a1', user: 'свой', fields: '+poster' });
  });

  it('чужому отказывает вид, ссылка не подписывается', async () => {
    signedGetUrl.mockClear();

    await expect(service.signedUrl('a1', 'чужой', NOW)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(service.loadPoster('a1', 'чужой')).rejects.toBeInstanceOf(NotFoundError);
    expect(signedGetUrl).not.toHaveBeenCalled();
  });
});
