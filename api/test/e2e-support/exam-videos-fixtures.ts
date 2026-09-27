// Минимальные валидные байты видео для e2e (ADR-0133) — формат сервер
// определяет по сигнатуре, не по заголовку (exam-video-upload.ts), поэтому
// сигнатура обязана быть настоящей. Общий хелпер для exam-videos.e2e-spec.ts
// и любого другого e2e, которому нужен файл видео (CLAUDE.md «Дубли»).
export function mp4Bytes(size = 64): Buffer {
  const head = Buffer.concat([
    Buffer.from([0, 0, 0, 0x20]),
    Buffer.from('ftyp', 'ascii'),
    Buffer.from('isom', 'ascii'),
  ]);
  return Buffer.concat([head, Buffer.alloc(Math.max(size - head.length, 0))]);
}
