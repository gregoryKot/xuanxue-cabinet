import { describe, expect, it } from 'vitest';
import { buildExamMediaTelegramLink } from './examMediaDeepLink';

describe('buildExamMediaTelegramLink', () => {
  it('собирает t.me-ссылку с payload exam_<id>', () => {
    expect(buildExamMediaTelegramLink('xuanxue_bot', 'a1')).toBe(
      'https://t.me/xuanxue_bot?start=exam_a1',
    );
  });

  it('кодирует attemptId, если в нём есть спецсимволы', () => {
    expect(buildExamMediaTelegramLink('xuanxue_bot', 'a&1')).toBe(
      'https://t.me/xuanxue_bot?start=exam_a%261',
    );
  });
});
