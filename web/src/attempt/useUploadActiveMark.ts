// Держит отметку «этот видео-ответ грузится» в activeUploads.ts, пока
// загрузка идёт, и снимает её на размонтировании (аудит 2026-10-01, H:
// «Отправить» размонтировало блок загрузки и рвало её молча). Отдельный
// хук, а не эффект внутри общего загрузчика (video-upload/useVideoUpload.ts):
// тот знает про видео вообще, а отметка — про попытку (ключ
// `attemptId:itemId`), и нужна только ответу ученика.
import { useEffect } from 'react';
import { markUploadActive } from './activeUploads';

export function useUploadActiveMark(
  attemptId: string,
  itemId: string,
  active: boolean,
): void {
  useEffect(() => {
    const key = `${attemptId}:${itemId}`;
    markUploadActive(key, active);
    return () => markUploadActive(key, false);
  }, [attemptId, itemId, active]);
}
