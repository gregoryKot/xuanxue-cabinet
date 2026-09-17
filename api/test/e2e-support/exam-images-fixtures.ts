// Минимальные валидные байты картинки для e2e (ADR-0035) — формат сервер
// определяет по сигнатуре, не по заголовку (exam-image-upload.ts), поэтому
// сигнатура обязана быть настоящей. Общий хелпер для exam-images.e2e-spec.ts
// и exam-item-images.e2e-spec.ts — не дублируем (CLAUDE.md «Храповики», jscpd).
export function jpegBytes(size = 64): Buffer {
  const head = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  return Buffer.concat([head, Buffer.alloc(Math.max(size - head.length, 0))]);
}

export function pngBytes(size = 64): Buffer {
  const head = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([head, Buffer.alloc(Math.max(size - head.length, 0))]);
}
