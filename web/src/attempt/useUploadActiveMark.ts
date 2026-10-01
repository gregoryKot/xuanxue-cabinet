// Держит отметку «этот видео-ответ грузится» в activeUploads.ts, пока
// загрузка идёт, и снимает её на размонтировании (аудит 2026-10-01, H:
// «Отправить» размонтировало блок загрузки и рвало её молча). Отдельный
// хук, а не эффект внутри useAnswerVideoUpload.ts: тот файл у потолка
// размера (CLAUDE.md «Храповики»), а компоненту AttemptVideoUpload.tsx
// признак `active` и так уже нужен для вёрстки.
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
