// План сжатия видео в браузере (ADR-0165, ADR-0188): чистая арифметика без
// библиотеки и без DOM — что делать с выбранным файлом и до какого кадра и
// битрейта перегнать. Сам перегон — compressVideo.ts.

const BYTES_PER_MIB = 1024 * 1024;

/** H.264-файл не больше этого не сжимаем: он и так уходит одной частью (8 МиБ,
 * ANSWER_VIDEO_LIMITS.partBytes), а секунды ожидания сжатия съели бы выигрыш.
 * Видео в другом кодеке этот порог не касается (ADR-0188). */
const COMPRESSION_MIN_BYTES = 8 * BYTES_PER_MIB;

/** Имя H.264 в Mediabunny (`track.getCodec()`). Его открывает любой браузер; HEVC,
 * VP9, AV1 и всё остальное — не любой (ADR-0188). */
const H264_CODEC = 'avc';

/** Длинная и короткая сторона кадра: 1280×720 хватает, чтобы учитель разобрал
 * движение, а 1080p и 4K с телефона в 5–10 раз тяжелее (ADR-0165). Две границы,
 * а не одна ширина: вертикальное видео — те же 720×1280. */
const MAX_LONG_SIDE_PX = 1280;
const MAX_SHORT_SIDE_PX = 720;

/** Около 2 Мбит/с для H.264 в 720p — чистая картинка при движении; ученик на
 * слабой связи грузит пять минут формы за пару минут, а не за час. */
export const TARGET_VIDEO_BITRATE = 2_000_000;

/** Выше 30 кадров/с (iPhone снимает и 60) глазу учителя не прибавляет, а файл
 * растёт; ниже — не трогаем: 24 кадра, растянутые до 30, только тяжелее. */
const MAX_FRAME_RATE = 30;

/** Сжатый файл берём, только если он заметно меньше исходника: на 5% выигрыш
 * не стоит риска, что перекодирование что-то испортило в картинке. */
const MAX_COMPRESSED_SHARE = 0.8;

export interface VideoSourceInfo {
  sizeBytes: number;
  /** Размер кадра как его видит зритель, уже с поворотом из метаданных. */
  displayWidth: number;
  displayHeight: number;
  /** Кадров в секунду; 0 или нет — не знаем. */
  frameRate?: number;
}

export interface VideoCompressionTarget {
  width: number;
  height: number;
  bitrate: number;
  /** Только если исходник быстрее предела или частота неизвестна. */
  frameRate?: number;
}

/** Окупится ли сжатие H.264-файла такого размера. */
export function isWorthCompressing(sizeBytes: number): boolean {
  return sizeBytes > COMPRESSION_MIN_BYTES;
}

/** Нужен ли перегон ради совместимости, а не ради размера: первая дорожка не
 * H.264 (iPhone пишет HEVC, он не открывается в Firefox и в части Chromium без
 * аппаратного HEVC — MIUI Browser; ADR-0188). Кодек не опознан (`null`) — тоже
 * «не H.264»: что он откроется у каждого, сказать нельзя. */
export function needsCompatibilityTranscode(codec: string | null): boolean {
  return codec !== H264_CODEC;
}

/** Браться ли за перегон: файл не H.264 — всегда, H.264 — только если размер
 * окупает сжатие. Так маленький HEVC-ролик вопроса (он и есть маленький)
 * больше не уходит в хранилище как снят (ADR-0188). */
export function shouldConvertSource(sizeBytes: number, codec: string | null): boolean {
  return needsCompatibilityTranscode(codec) || isWorthCompressing(sizeBytes);
}

/** Можно ли человеку отказаться от перегона и отправить исходник: у не-H.264
 * файла нельзя, иначе часть зрителей снова получит чёрный прямоугольник. */
export function canSkipConversion(codec: string | null): boolean {
  return !needsCompatibilityTranscode(codec);
}

function evenFloor(value: number): number {
  return Math.max(2, Math.floor(value / 2) * 2);
}

/** Цель перегона или `null` — размеры кадра не прочитались, сжимать нечем.
 * Кадр уменьшается с сохранением пропорций и не увеличивается; стороны чётные,
 * как требует H.264. */
export function planVideoCompression(
  info: VideoSourceInfo,
): VideoCompressionTarget | null {
  const { displayWidth, displayHeight, frameRate } = info;
  if (!(displayWidth > 0) || !(displayHeight > 0)) return null;
  const longSide = Math.max(displayWidth, displayHeight);
  const shortSide = Math.min(displayWidth, displayHeight);
  const scale = Math.min(1, MAX_LONG_SIDE_PX / longSide, MAX_SHORT_SIDE_PX / shortSide);
  const needsFrameRateCap = !frameRate || frameRate > MAX_FRAME_RATE;
  return {
    width: evenFloor(displayWidth * scale),
    height: evenFloor(displayHeight * scale),
    bitrate: TARGET_VIDEO_BITRATE,
    ...(needsFrameRateCap ? { frameRate: MAX_FRAME_RATE } : {}),
  };
}

/** Брать ли результат перегона вместо исходника. Не-H.264 исходник заменяется
 * всегда, даже если H.264 вышел не меньше: HEVC сам по себе компактнее, а цель
 * здесь — чтобы файл открылся (ADR-0188). У H.264 действует правило 80%. */
export function shouldUseCompressed(
  originalBytes: number,
  compressedBytes: number,
  sourceCodec: string | null,
): boolean {
  if (!(compressedBytes > 0)) return false;
  if (needsCompatibilityTranscode(sourceCodec)) return true;
  return compressedBytes < originalBytes * MAX_COMPRESSED_SHARE;
}
