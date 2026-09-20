// Чистая логика, без Mongo и DI (CLAUDE.md «Тесты»).
import type { Message } from 'telegraf/types';
import { extractPaymentScreenshotSource } from './payment-screenshot-source';

describe('extractPaymentScreenshotSource', () => {
  it('фото — берёт последний (самый крупный) размер', () => {
    const message = {
      photo: [
        { file_id: 'p-small', file_unique_id: 'pu-small' },
        { file_id: 'p-large', file_unique_id: 'pu-large' },
      ],
    } as unknown as Message;

    expect(extractPaymentScreenshotSource(message)).toEqual({
      fileId: 'p-large',
      fileUniqueId: 'pu-large',
    });
  });

  it('документ с image/* — fileId/fileUniqueId', () => {
    const message = {
      document: { file_id: 'd1', file_unique_id: 'du1', mime_type: 'image/jpeg' },
    } as unknown as Message;

    expect(extractPaymentScreenshotSource(message)).toEqual({
      fileId: 'd1',
      fileUniqueId: 'du1',
    });
  });

  it('документ не image/* — null', () => {
    const message = {
      document: { file_id: 'd2', file_unique_id: 'du2', mime_type: 'application/pdf' },
    } as unknown as Message;

    expect(extractPaymentScreenshotSource(message)).toBeNull();
  });

  it('документ без mime_type — null', () => {
    const message = {
      document: { file_id: 'd3', file_unique_id: 'du3' },
    } as unknown as Message;

    expect(extractPaymentScreenshotSource(message)).toBeNull();
  });

  it('текст — null (не источник скриншота)', () => {
    expect(
      extractPaymentScreenshotSource({ text: 'привет' } as unknown as Message),
    ).toBeNull();
  });

  it('нет сообщения — null', () => {
    expect(extractPaymentScreenshotSource(undefined)).toBeNull();
  });
});
