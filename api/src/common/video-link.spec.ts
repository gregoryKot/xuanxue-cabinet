// Чистая логика без Mongo и без DI (CLAUDE.md «Тесты»): какие параметры
// скачивания получит подписанная ссылка на видео (ADR-0165).
import { EXAM_VIDEO_CONTENT_TYPES } from '@xuanxue/shared';
import { VIEW_VIDEO, videoDownload } from './video-link';

const DOWNLOAD = { download: true };

describe('videoDownload', () => {
  it('просмотр — параметров скачивания нет, какой бы тип ни был', () => {
    expect(videoDownload(VIEW_VIDEO, 'video/mp4')).toBeUndefined();
    expect(videoDownload(VIEW_VIDEO)).toBeUndefined();
  });

  it.each([
    ['video/mp4', 'video.mp4'],
    ['video/quicktime', 'video.mov'],
    ['video/webm', 'video.webm'],
  ])('скачивание %s — файл %s и тот же тип в ответе', (contentType, name) => {
    expect(videoDownload(DOWNLOAD, contentType)).toEqual({ name, contentType });
  });

  it('каждый тип, который принимает загрузка, получает своё расширение', () => {
    for (const contentType of EXAM_VIDEO_CONTENT_TYPES) {
      expect(videoDownload(DOWNLOAD, contentType)?.name).toMatch(/^video\.[a-z0-9]+$/);
    }
  });

  it('типа нет (недогруженный или старый видео-ответ) — mp4', () => {
    expect(videoDownload(DOWNLOAD)).toEqual({
      name: 'video.mp4',
      contentType: 'video/mp4',
    });
  });

  it('тип чужой — тоже mp4, а не расширение из чужой строки', () => {
    expect(videoDownload(DOWNLOAD, 'text/html')).toEqual({
      name: 'video.mp4',
      contentType: 'video/mp4',
    });
  });
});
