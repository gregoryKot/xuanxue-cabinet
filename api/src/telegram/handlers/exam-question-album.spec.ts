// Чистая сборка альбома (без Mongo/Telegram) + отправка с фейковыми ctx и
// ExamBotPort (CLAUDE.md «Тесты») — сборка и порядок совпадают с тем, что
// видно на экране вопроса (headerLine/formatOptionLabel, exam-question-screen.ts);
// отправка — каждая картинка своим sendPhoto со своей подписью (ADR-0118),
// кэш file_id, деградация при сбое (ADR-0035, PLAN.md §12 слой 4б.2).
import { Logger } from '@nestjs/common';
import type { Context } from 'telegraf';
import type { AttemptQuestionDto } from '@xuanxue/shared';
import type { UserLean } from '../../users/users.service';
import { fakeExamBotPort } from '../exam-bot.port.test-support';
import { buildOptionAlbum } from './exam-question-album';
import { sendOptionAlbum } from './exam-question-album-send';

const ATTEMPT_ID = '507f1f77bcf86cd799439011';
const CHAT_ID = 111;
const USER: UserLean = {
  id: 'u1',
  name: 'Ученик',
  roles: [],
  status: 'active',
};
const IMAGE = { bytes: Buffer.from([1, 2, 3]), contentType: 'image/jpeg' as const };

function question(overrides: Partial<AttemptQuestionDto> = {}): AttemptQuestionDto {
  return {
    itemId: 'i1',
    version: 1,
    kind: 'single',
    prompt: 'Вопрос',
    options: [],
    ...overrides,
  };
}

function photoSize(fileId: string) {
  return { file_id: fileId, file_unique_id: `u-${fileId}`, width: 10, height: 10 };
}

function fakeCtx(): { ctx: Context; sendPhoto: jest.Mock } {
  const sendPhoto = jest.fn().mockResolvedValue({
    message_id: 1,
    photo: [photoSize('f-small'), photoSize('f-big')],
  });
  const ctx = { telegram: { sendPhoto } } as unknown as Context;
  return { ctx, sendPhoto };
}

describe('buildOptionAlbum', () => {
  it('вопрос text/video — пустой альбом', () => {
    expect(buildOptionAlbum(question({ kind: 'text' }), 0)).toEqual([]);
    expect(buildOptionAlbum(question({ kind: 'video' }), 0)).toEqual([]);
  });

  it('вариант без imageId в альбом не попадает, подпись — с номерами вопроса и варианта', () => {
    const q = question({
      options: [
        { id: 'o1', text: 'Без картинки' },
        { id: 'o2', text: 'С картинкой', imageId: 'img-2' },
      ],
    });
    expect(buildOptionAlbum(q, 2)).toEqual([
      { imageId: 'img-2', optionIndex: 1, caption: 'Вопрос 3 — вариант 2: С картинкой' },
    ]);
  });

  it('подпись без текста варианта — только номера', () => {
    const q = question({ options: [{ id: 'o1', text: '', imageId: 'img-1' }] });
    expect(buildOptionAlbum(q, 0)).toEqual([
      { imageId: 'img-1', optionIndex: 0, caption: 'Вопрос 1 — вариант 1' },
    ]);
  });

  it('текст длиннее 100 символов обрезается с «…»', () => {
    const long = 'а'.repeat(150);
    const q = question({ options: [{ id: 'o1', text: long, imageId: 'img-1' }] });
    const [entry] = buildOptionAlbum(q, 0);
    expect(entry?.caption).toBe(`Вопрос 1 — вариант 1: ${'а'.repeat(99)}…`);
  });

  it('порядок записей — как у вариантов в вопросе', () => {
    const q = question({
      options: [
        { id: 'o1', text: 'A', imageId: 'img-a' },
        { id: 'o2', text: 'B' },
        { id: 'o3', text: 'C', imageId: 'img-c' },
      ],
    });
    expect(buildOptionAlbum(q, 0).map((e) => e.imageId)).toEqual(['img-a', 'img-c']);
  });
});

describe('sendOptionAlbum', () => {
  it('пустой альбом — ничего не отправляет и не зовёт порт', async () => {
    const { ctx, sendPhoto } = fakeCtx();
    const port = fakeExamBotPort();

    await sendOptionAlbum(ctx, port, USER, CHAT_ID, [], ATTEMPT_ID);

    expect(sendPhoto).not.toHaveBeenCalled();
    expect(port.loadOptionImage).not.toHaveBeenCalled();
  });

  it('одна картинка — sendPhoto байтами, file_id (самого большого размера) сохраняется через порт', async () => {
    const { ctx, sendPhoto } = fakeCtx();
    const port = fakeExamBotPort({ loadOptionImage: jest.fn().mockResolvedValue(IMAGE) });
    const album = [{ imageId: 'img-1', optionIndex: 0, caption: 'Вопрос 1 — вариант 1' }];

    await sendOptionAlbum(ctx, port, USER, CHAT_ID, album, ATTEMPT_ID);

    expect(sendPhoto).toHaveBeenCalledTimes(1);
    const [, media, extra] = sendPhoto.mock.calls[0] as [
      number,
      { source: Buffer; filename: string },
      { caption: string },
    ];
    expect(media.source).toBe(IMAGE.bytes);
    expect(media.filename).toBe('variant-1.jpg');
    expect(extra.caption).toBe('Вопрос 1 — вариант 1');
    expect(port.rememberTelegramFileId).toHaveBeenCalledWith('img-1', 'f-big');
  });

  // Причина, ради которой затевался ADR-0118: sendMediaGroup прячет подписи
  // отдельных плиток от ученика в ленте — теперь каждая картинка идёт своим
  // сообщением со своей подписью, и подпись видна сразу под фото.
  it('две картинки — два отдельных sendPhoto, у каждого своя подпись с номером своего варианта', async () => {
    const { ctx, sendPhoto } = fakeCtx();
    sendPhoto
      .mockResolvedValueOnce({ message_id: 1, photo: [photoSize('f-1')] })
      .mockResolvedValueOnce({ message_id: 2, photo: [photoSize('f-2')] });
    const port = fakeExamBotPort({ loadOptionImage: jest.fn().mockResolvedValue(IMAGE) });
    const album = [
      { imageId: 'img-1', optionIndex: 0, caption: 'Вопрос 1 — вариант 1' },
      { imageId: 'img-2', optionIndex: 2, caption: 'Вопрос 1 — вариант 3' },
    ];

    await sendOptionAlbum(ctx, port, USER, CHAT_ID, album, ATTEMPT_ID);

    expect(sendPhoto).toHaveBeenCalledTimes(2);
    const [, firstMedia, firstExtra] = sendPhoto.mock.calls[0] as [
      number,
      { filename: string },
      { caption: string },
    ];
    const [, secondMedia, secondExtra] = sendPhoto.mock.calls[1] as [
      number,
      { filename: string },
      { caption: string },
    ];
    expect(firstMedia.filename).toBe('variant-1.jpg');
    expect(firstExtra.caption).toBe('Вопрос 1 — вариант 1');
    expect(secondMedia.filename).toBe('variant-3.jpg');
    expect(secondExtra.caption).toBe('Вопрос 1 — вариант 3');
    expect(port.rememberTelegramFileId).toHaveBeenCalledWith('img-1', 'f-1');
    expect(port.rememberTelegramFileId).toHaveBeenCalledWith('img-2', 'f-2');
  });

  it('первая картинка не ушла — вторая всё равно отправлена', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { ctx, sendPhoto } = fakeCtx();
    sendPhoto
      .mockRejectedValueOnce(new Error('сеть недоступна'))
      .mockResolvedValueOnce({ message_id: 2, photo: [photoSize('f-2')] });
    const port = fakeExamBotPort({ loadOptionImage: jest.fn().mockResolvedValue(IMAGE) });
    const album = [
      { imageId: 'img-1', optionIndex: 0, caption: 'Вопрос 1 — вариант 1' },
      { imageId: 'img-2', optionIndex: 1, caption: 'Вопрос 1 — вариант 2' },
    ];

    await sendOptionAlbum(ctx, port, USER, CHAT_ID, album, ATTEMPT_ID);

    expect(sendPhoto).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(1);
    const [, , secondExtra] = sendPhoto.mock.calls[1] as [
      number,
      unknown,
      { caption: string },
    ];
    expect(secondExtra.caption).toBe('Вопрос 1 — вариант 2');
    expect(port.rememberTelegramFileId).toHaveBeenCalledTimes(1);
    expect(port.rememberTelegramFileId).toHaveBeenCalledWith('img-2', 'f-2');
    warn.mockRestore();
  });

  it('известный file_id — шлётся строкой, не байтами, повторно не запоминается', async () => {
    const { ctx, sendPhoto } = fakeCtx();
    const port = fakeExamBotPort({
      loadOptionImage: jest
        .fn()
        .mockResolvedValue({ ...IMAGE, telegramFileId: 'known-id' }),
    });
    const album = [{ imageId: 'img-1', optionIndex: 0, caption: 'Вопрос 1 — вариант 1' }];

    await sendOptionAlbum(ctx, port, USER, CHAT_ID, album, ATTEMPT_ID);

    const [, media] = sendPhoto.mock.calls[0] as [number, string, unknown];
    expect(media).toBe('known-id');
    expect(port.rememberTelegramFileId).not.toHaveBeenCalled();
  });

  it('Telegram отверг известный file_id — повтор байтами, file_id перезаписан', async () => {
    const { ctx, sendPhoto } = fakeCtx();
    sendPhoto
      .mockRejectedValueOnce(new Error('wrong file_id'))
      .mockResolvedValueOnce({ message_id: 2, photo: [photoSize('f-new')] });
    const port = fakeExamBotPort({
      loadOptionImage: jest
        .fn()
        .mockResolvedValue({ ...IMAGE, telegramFileId: 'stale-id' }),
    });
    const album = [{ imageId: 'img-1', optionIndex: 0, caption: 'Вопрос 1 — вариант 1' }];

    await sendOptionAlbum(ctx, port, USER, CHAT_ID, album, ATTEMPT_ID);

    expect(sendPhoto).toHaveBeenCalledTimes(2);
    const [, secondMedia] = sendPhoto.mock.calls[1] as [
      number,
      { source: Buffer },
      unknown,
    ];
    expect(secondMedia.source).toBe(IMAGE.bytes); // второй раз — байтами, не строкой
    expect(port.rememberTelegramFileId).toHaveBeenCalledWith('img-1', 'f-new');
  });

  it('полный сбой отправки (без кэша file_id — повторять нечем) — warn, без исключения', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { ctx, sendPhoto } = fakeCtx();
    sendPhoto.mockRejectedValue(new Error('сеть недоступна'));
    const port = fakeExamBotPort({ loadOptionImage: jest.fn().mockResolvedValue(IMAGE) });
    const album = [{ imageId: 'img-1', optionIndex: 0, caption: 'Вопрос 1 — вариант 1' }];

    await expect(
      sendOptionAlbum(ctx, port, USER, CHAT_ID, album, ATTEMPT_ID),
    ).resolves.toBeUndefined();

    expect(sendPhoto).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
    expect(port.rememberTelegramFileId).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('сбой чтения байтов (порт бросил) — warn, без исключения и без отправки', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { ctx, sendPhoto } = fakeCtx();
    const port = fakeExamBotPort({
      loadOptionImage: jest.fn().mockRejectedValue(new Error('mongo упал')),
    });
    const album = [{ imageId: 'img-1', optionIndex: 0, caption: 'Вопрос 1 — вариант 1' }];

    await expect(
      sendOptionAlbum(ctx, port, USER, CHAT_ID, album, ATTEMPT_ID),
    ).resolves.toBeUndefined();

    expect(sendPhoto).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('картинка недоступна (удалена/не своя) — то фото пропускается, остальные уходят', async () => {
    const { ctx, sendPhoto } = fakeCtx();
    const port = fakeExamBotPort({
      loadOptionImage: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(IMAGE),
    });
    const album = [
      { imageId: 'img-1', optionIndex: 0, caption: 'C1' },
      { imageId: 'img-2', optionIndex: 1, caption: 'C2' },
    ];

    await sendOptionAlbum(ctx, port, USER, CHAT_ID, album, ATTEMPT_ID);

    expect(sendPhoto).toHaveBeenCalledTimes(1); // осталась одна картинка из двух
    const [, , extra] = sendPhoto.mock.calls[0] as [number, unknown, { caption: string }];
    expect(extra.caption).toBe('C2');
  });

  it('ни одна картинка не нашлась — ничего не отправляет, без исключения', async () => {
    const { ctx, sendPhoto } = fakeCtx();
    const port = fakeExamBotPort();
    const album = [{ imageId: 'img-1', optionIndex: 0, caption: 'C1' }];

    await expect(
      sendOptionAlbum(ctx, port, USER, CHAT_ID, album, ATTEMPT_ID),
    ).resolves.toBeUndefined();
    expect(sendPhoto).not.toHaveBeenCalled();
  });
});
