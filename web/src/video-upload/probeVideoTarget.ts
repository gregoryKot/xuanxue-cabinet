// Цель перегона по первой видеодорожке (ADR-0165): размеры кадра и частота из
// метаданных и первых пакетов. Вынесено из compressVideo.ts (файловый лимит,
// CLAUDE.md «Храповики»): там порядок «прочитать кодек → решить → перегнать».
import type * as Mediabunny from 'mediabunny';
import {
  planVideoCompression,
  type VideoCompressionTarget,
} from './videoCompressionPlan';

/** Сколько пакетов читаем, чтобы прикинуть частоту кадров: хватает на оценку,
 * а весь файл просматривать незачем. */
const FRAME_RATE_SAMPLE_PACKETS = 60;

export async function probeTarget(
  track: Mediabunny.InputVideoTrack,
  sizeBytes: number,
): Promise<VideoCompressionTarget | null> {
  const [displayWidth, displayHeight, stats] = await Promise.all([
    track.getDisplayWidth(),
    track.getDisplayHeight(),
    track.computePacketStats(FRAME_RATE_SAMPLE_PACKETS),
  ]);
  return planVideoCompression({
    sizeBytes,
    displayWidth,
    displayHeight,
    frameRate: stats.averagePacketRate,
  });
}
