import { describe, expect, it } from 'vitest';
import { buildExamMediaTelegramLink } from './examMediaDeepLink';

describe('buildExamMediaTelegramLink', () => {
  it('собирает t.me-ссылку с payload exam_<attemptId>_<itemId>', () => {
    expect(buildExamMediaTelegramLink('xuanxue_bot', 'a1', 'q3')).toBe(
      'https://t.me/xuanxue_bot?start=exam_a1_q3',
    );
  });

  it('кодирует attemptId и itemId, если в них есть спецсимволы', () => {
    expect(buildExamMediaTelegramLink('xuanxue_bot', 'a&1', 'q&3')).toBe(
      'https://t.me/xuanxue_bot?start=exam_a%261_q%263',
    );
  });
});
