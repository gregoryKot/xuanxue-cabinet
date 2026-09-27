import { describe, expect, it } from 'vitest';
import { examVideoSrc } from './examVideoPaths';

describe('examVideoSrc', () => {
  it('собирает адрес видео с префиксом /api для <video src> (ADR-0133)', () => {
    expect(examVideoSrc('652f00000000000000000002')).toBe(
      '/api/exam-videos/652f00000000000000000002',
    );
  });
});
