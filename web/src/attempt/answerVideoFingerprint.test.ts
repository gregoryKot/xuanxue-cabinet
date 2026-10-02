// jsdom (vitest) отдаёт `crypto.subtle` из Node и `Blob.slice/arrayBuffer` —
// проверено на этой сборке, подмена webcrypto не понадобилась. Если версия
// jsdom однажды потеряет их, тесты упадут здесь, а не промолчат.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ANSWER_VIDEO_LIMITS } from '@xuanxue/shared';
import { computeAnswerVideoFingerprint } from './answerVideoFingerprint';

const MIB = 1024 * 1024;
const SHA256_HEX_LENGTH = 64;
/** SHA-256 от «abc» — эталон из FIPS 180-2: проверяет и алгоритм, и hex. */
const SHA256_OF_ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

/** Детерминированные «видеобайты» без случайности: у соседних позиций разные
 * значения, чтобы перестановка кусков тоже ловилась. */
function makeBytes(size: number): Uint8Array<ArrayBuffer> {
  return Uint8Array.from({ length: size }, (_, index) => (index * 31 + 7) % 251);
}

function makeFile(
  bytes: Uint8Array<ArrayBuffer>,
  name = 'form.mp4',
  lastModified = 1,
): File {
  return new File([bytes], name, { type: 'video/mp4', lastModified });
}

/** Те же байты с одним изменённым — сам исходный массив не трогаем. */
function withByteChanged(
  bytes: Uint8Array<ArrayBuffer>,
  index: number,
): Uint8Array<ArrayBuffer> {
  const copy = bytes.slice();
  copy[index] = (copy[index] ?? 0) ^ 0xff;
  return copy;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('computeAnswerVideoFingerprint — по содержимому', () => {
  it('те же байты дают тот же отпечаток при другом имени и дате изменения', async () => {
    const bytes = makeBytes(3 * MIB);
    const first = await computeAnswerVideoFingerprint(makeFile(bytes, 'IMG_1.MOV', 1));
    const second = await computeAnswerVideoFingerprint(makeFile(bytes, 'form.mp4', 2));
    expect(second).toBe(first);
  });

  it('формат «размер:SHA-256 в hex», алгоритм сверен с эталоном', async () => {
    const abc = new Blob([new TextEncoder().encode('abc')]);
    expect(await computeAnswerVideoFingerprint(abc)).toBe(`3:${SHA256_OF_ABC}`);
  });

  it('пустой файл не падает', async () => {
    const fingerprint = await computeAnswerVideoFingerprint(new Blob([]));
    expect(fingerprint).toMatch(/^0:[0-9a-f]{64}$/);
  });

  it('помещается в предел сервера, в том числе при размере в потолок', async () => {
    const fingerprint = await computeAnswerVideoFingerprint(makeFile(makeBytes(10)));
    expect(fingerprint.length).toBeLessThanOrEqual(ANSWER_VIDEO_LIMITS.fingerprint);
    const worstCase = `${ANSWER_VIDEO_LIMITS.maxBytes}:${'f'.repeat(SHA256_HEX_LENGTH)}`;
    expect(worstCase.length).toBeLessThanOrEqual(ANSWER_VIDEO_LIMITS.fingerprint);
  });
});

describe('computeAnswerVideoFingerprint — большой файл (голова и хвост)', () => {
  const bytes = makeBytes(3 * MIB);

  it.each([
    ['первый байт', 0],
    ['последний байт головы', MIB - 1],
    ['первый байт хвоста', 2 * MIB],
    ['последний байт файла', 3 * MIB - 1],
  ])('изменённый %s даёт другой отпечаток', async (_name, index) => {
    const original = await computeAnswerVideoFingerprint(makeFile(bytes));
    const changed = await computeAnswerVideoFingerprint(
      makeFile(withByteChanged(bytes, index)),
    );
    expect(changed).not.toBe(original);
  });

  it('середина вне окон не читается: так 1 ГБ не уходит в память целиком', async () => {
    const original = await computeAnswerVideoFingerprint(makeFile(bytes));
    const changed = await computeAnswerVideoFingerprint(
      makeFile(withByteChanged(bytes, MIB + 5)),
    );
    expect(changed).toBe(original);
  });

  it('другой размер даёт другой отпечаток, даже если окна те же', async () => {
    const head = bytes.subarray(0, MIB);
    const tail = bytes.subarray(2 * MIB);
    const shorter = new Blob([head, new Uint8Array(MIB), tail]);
    const longer = new Blob([head, new Uint8Array(MIB + 1), tail]);
    expect(await computeAnswerVideoFingerprint(longer)).not.toBe(
      await computeAnswerVideoFingerprint(shorter),
    );
  });
});

describe('computeAnswerVideoFingerprint — небольшой файл (целиком)', () => {
  it('до 2 МиБ включительно хэшируется весь файл, середина тоже', async () => {
    const bytes = makeBytes(2 * MIB);
    const original = await computeAnswerVideoFingerprint(makeFile(bytes));
    const changed = await computeAnswerVideoFingerprint(
      makeFile(withByteChanged(bytes, MIB)),
    );
    expect(changed).not.toBe(original);
  });

  it('на байт больше 2 МиБ середина уже вне окон — граница ровно здесь', async () => {
    const bytes = makeBytes(2 * MIB + 1);
    const original = await computeAnswerVideoFingerprint(makeFile(bytes));
    const changed = await computeAnswerVideoFingerprint(
      makeFile(withByteChanged(bytes, MIB)),
    );
    expect(changed).toBe(original);
  });
});

describe('computeAnswerVideoFingerprint — без crypto.subtle', () => {
  it('у File — старый отпечаток «размер:дата», страница не падает', async () => {
    vi.stubGlobal('crypto', {});
    const file = makeFile(makeBytes(10), 'form.mp4', 42);
    expect(await computeAnswerVideoFingerprint(file)).toBe('10:42');
  });

  it('у Blob без даты каждый раз новый: чужие части продолжать нельзя', async () => {
    vi.stubGlobal('crypto', {});
    const blob = new Blob([makeBytes(10)]);
    const first = await computeAnswerVideoFingerprint(blob);
    const second = await computeAnswerVideoFingerprint(blob);
    expect(first).toMatch(/^10:new-/);
    expect(second).not.toBe(first);
    expect(first.length).toBeLessThanOrEqual(ANSWER_VIDEO_LIMITS.fingerprint);
  });
});

describe('computeAnswerVideoFingerprint — файл не читается', () => {
  it('отвергает промис, а не возвращает отпечаток по недочитанному', async () => {
    const file = makeFile(makeBytes(10));
    vi.spyOn(file, 'arrayBuffer').mockRejectedValue(new Error('NotReadableError'));
    await expect(computeAnswerVideoFingerprint(file)).rejects.toThrow('NotReadableError');
  });
});
