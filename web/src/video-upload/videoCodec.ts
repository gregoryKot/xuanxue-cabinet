// Кодек видеодорожки для сервера (ADR-0189): Mediabunny называет кодек строкой
// (`track.getCodec()`), а серверу можно слать только имена из VIDEO_CODECS.
// Чистая функция без библиотеки, юнит-тест без DOM.
import { VIDEO_CODECS, type VideoCodec } from '@xuanxue/shared';

/** Кодек из списка сервера или `undefined`: дорожки нет, кодек не прочитан или
 * его нет в VIDEO_CODECS (Mediabunny знает и `prores`). Тогда браузер просто не
 * сообщает кодек — видео остаётся «не известным как H.264» и ждёт «Перегнать
 * видео», а не падает на валидации сервера. */
export function toVideoCodec(value: unknown): VideoCodec | undefined {
  return VIDEO_CODECS.find((codec) => codec === value);
}
