import { describe, expect, it } from 'vitest';
import { EXAM_VIDEO_LIMITS } from '@xuanxue/shared';
import { validateExamVideoUrl } from './examVideoFormInput';

describe('validateExamVideoUrl', () => {
  it('пустая ссылка — ошибка', () => {
    expect(validateExamVideoUrl('  ')).toMatch(/Укажите ссылку/);
  });

  it('не https — ошибка', () => {
    expect(validateExamVideoUrl('http://youtu.be/x')).toMatch(/https:\/\//);
  });

  it('слишком длинная ссылка — ошибка с лимитом', () => {
    const url = 'https://' + 'a'.repeat(EXAM_VIDEO_LIMITS.videoUrl);
    expect(validateExamVideoUrl(url)).toMatch(String(EXAM_VIDEO_LIMITS.videoUrl));
  });

  it('валидная https-ссылка — null', () => {
    expect(validateExamVideoUrl('https://youtu.be/x')).toBeNull();
  });
});
