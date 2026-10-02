// Чистая логика без Mongo и без DI (CLAUDE.md «Тесты»): какие параметры
// скачивания получит подписанная ссылка на видео (ADR-0165).
import { DateTime } from 'luxon';
import { EXAM_VIDEO_CONTENT_TYPES } from '@xuanxue/shared';
import type { SignedDownload } from '../storage/file-store.service';
import { VIEW_VIDEO, signedVideoUrl, videoDownload } from './video-link';

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

describe('signedVideoUrl', () => {
  const NOW = DateTime.utc(2026, 10, 2, 10, 0, 0);
  const HOUR_SECONDS = 3600;

  function fakeStore() {
    const calls: { key: string; ttl: number; download?: SignedDownload }[] = [];
    const fileStore = {
      signedGetUrl: (
        key: string,
        ttl: number,
        _now: DateTime,
        download?: SignedDownload,
      ) => {
        calls.push({ key, ttl, download });
        return `https://fake-r2.example/${key}`;
      },
    };
    return { fileStore, calls };
  }

  it('просмотр — ключ объекта и час жизни, без параметров скачивания', () => {
    const { fileStore, calls } = fakeStore();

    const url = signedVideoUrl({
      fileStore,
      doc: { key: 'exam-videos/x', contentType: 'video/mp4' },
      now: NOW,
      options: VIEW_VIDEO,
    });

    expect(url).toBe('https://fake-r2.example/exam-videos/x');
    expect(calls).toEqual([
      { key: 'exam-videos/x', ttl: HOUR_SECONDS, download: undefined },
    ]);
  });

  it('скачивание — имя и тип по типу из записи, тот же час', () => {
    const { fileStore, calls } = fakeStore();

    signedVideoUrl({
      fileStore,
      doc: { key: 'answer-videos/y', contentType: 'video/quicktime' },
      now: NOW,
      options: DOWNLOAD,
    });

    expect(calls).toEqual([
      {
        key: 'answer-videos/y',
        ttl: HOUR_SECONDS,
        download: { name: 'video.mov', contentType: 'video/quicktime' },
      },
    ]);
  });

  it('у записи нет типа — скачивание как video.mp4', () => {
    const { fileStore, calls } = fakeStore();

    signedVideoUrl({ fileStore, doc: { key: 'k' }, now: NOW, options: DOWNLOAD });

    expect(calls[0]?.download).toEqual({ name: 'video.mp4', contentType: 'video/mp4' });
  });
});
