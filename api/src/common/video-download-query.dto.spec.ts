// Юнит на class-validator/class-transformer без Nest (CLAUDE.md «Тесты»):
// `?download=` принимает только `1`, всё остальное — 400 от ValidationPipe.
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { VideoDownloadQueryDto } from './video-download-query.dto';

async function errorsFor(query: Record<string, unknown>): Promise<number> {
  return (await validate(plainToInstance(VideoDownloadQueryDto, query))).length;
}

describe('VideoDownloadQueryDto', () => {
  it('параметра нет — валиден (просмотр)', async () => {
    await expect(errorsFor({})).resolves.toBe(0);
  });

  it('download=1 — валиден', async () => {
    await expect(errorsFor({ download: '1' })).resolves.toBe(0);
  });

  it.each(['2', '0', 'true', '', '1 '])('download=%j — отказ', async (value) => {
    await expect(errorsFor({ download: value })).resolves.toBeGreaterThan(0);
  });

  it('параметр дважды (массив) — отказ, а не скачивание наугад', async () => {
    await expect(errorsFor({ download: ['1', '1'] })).resolves.toBeGreaterThan(0);
  });
});
