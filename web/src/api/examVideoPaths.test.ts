import { describe, expect, it } from 'vitest';
import {
  answerVideoSrc,
  examVideoBytesSrc,
  examVideoSrc,
  videoDownloadHref,
} from './examVideoPaths';

describe('examVideoSrc', () => {
  it('собирает адрес видео с префиксом /api для <video src> (ADR-0133)', () => {
    expect(examVideoSrc('652f00000000000000000002')).toBe(
      '/api/exam-videos/652f00000000000000000002',
    );
  });
});

describe('examVideoBytesSrc', () => {
  it('адрес байтов со своего домена для декодера, не 302 на R2 (ADR-0182)', () => {
    expect(examVideoBytesSrc('652f00000000000000000002')).toBe(
      '/api/exam-videos/652f00000000000000000002/bytes',
    );
  });
});

describe('videoDownloadHref', () => {
  it('добавляет ?download=1 к адресу видео вопроса и видео-ответа (ADR-0165)', () => {
    expect(videoDownloadHref(examVideoSrc('652f00000000000000000002'))).toBe(
      '/api/exam-videos/652f00000000000000000002?download=1',
    );
    expect(videoDownloadHref(answerVideoSrc('652f00000000000000000003'))).toBe(
      '/api/answer-videos/652f00000000000000000003?download=1',
    );
  });
});
