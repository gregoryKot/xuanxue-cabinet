// Общие HTTP-хелперы e2e «Перегнать видео» (ADR-0189) — делят
// exam-videos-transcode.e2e-spec.ts (список, кодек) и exam-videos-replace.e2e-spec.ts
// (подмена файла): файл-лимит спеков (CLAUDE.md «Храповики») не даёт держать оба в одном.
import request from 'supertest';
import type {
  ExamVideoDto,
  ExamVideoStatsDto,
  ReplaceExamVideoInput,
  SetVideoCodecInput,
  VideoCodec,
} from '@xuanxue/shared';
import type { TestApp } from './create-app';
import type { FakeFileStore } from './fake-file-store';
import type { FakeMultipartStore } from './fake-multipart-store';
import { uploadExamVideo } from './exam-videos-fixtures';
import { withCsrf } from './http';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1]);

/** `getApp` — геттер, не значение: вызывается лениво из `it()`, когда `beforeAll`
 * уже присвоил testApp. */
export function createTranscodeHelpers(
  getApp: () => TestApp,
  store: FakeFileStore,
  multipart: FakeMultipartStore,
) {
  const server = (): ReturnType<TestApp['app']['getHttpServer']> =>
    getApp().app.getHttpServer();

  /** Видео, загруженное обычным путём, с кадром и, если назван, кодеком; байты
   * объекта кладём и в фейк чтения (`bytes` ходит в FileStoreService, загрузка — в
   * MultipartStore). */
  async function upload(
    cookie: string,
    bytes: Buffer,
    codec?: VideoCodec,
  ): Promise<ExamVideoDto> {
    const video = await uploadExamVideo(server(), cookie, bytes, {
      ...(codec ? { codec } : {}),
      poster: JPEG.toString('base64'),
    });
    for (const [key, object] of multipart.objects) {
      store.objects.set(key, { bytes: object, contentType: video.contentType });
    }
    return video;
  }

  const list = (cookie?: string): request.Test => {
    const req = request(server()).get('/api/exam-videos/codec-pending');
    return cookie ? req.set('Cookie', cookie) : req;
  };
  const putCodec = (
    cookie: string | undefined,
    id: string,
    body: SetVideoCodecInput | object,
  ): request.Test => {
    const req = withCsrf(request(server()).put(`/api/exam-videos/${id}/codec`));
    return (cookie ? req.set('Cookie', cookie) : req).send(body);
  };
  const postReplace = (
    cookie: string | undefined,
    id: string,
    body: ReplaceExamVideoInput | object,
  ): request.Test => {
    const req = withCsrf(request(server()).post(`/api/exam-videos/${id}/replace`));
    return (cookie ? req.set('Cookie', cookie) : req).send(body);
  };
  const stats = async (cookie: string): Promise<ExamVideoStatsDto> =>
    (await request(server()).get('/api/exam-videos/stats-summary').set('Cookie', cookie))
      .body as ExamVideoStatsDto;
  const pendingIds = async (cookie: string): Promise<string[]> =>
    ((await list(cookie)).body as ExamVideoDto[]).map((video) => video.id);

  return { server, upload, list, putCodec, postReplace, stats, pendingIds };
}
