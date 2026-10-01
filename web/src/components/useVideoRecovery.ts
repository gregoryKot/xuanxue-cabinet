// Видео из файла само переживает обрыв связи и сворачивание приложения.
//
// `/api/exam-videos/:id` отвечает 302 (`no-store`) на подписанную ссылку R2 с
// жизнью час, и дальше браузер докачивает куски уже с неё. Телефон ушёл в
// фон — iOS рвёт соединение; слабая связь убивает загрузку так же. Элемент
// после этого либо стреляет `error`, либо вечно сидит в `waiting` без
// `progress`, а нативные контролы докачку не перезапускают: владельцу школы
// помогала только перезагрузка страницы (жалоба 2026-10-01). Поэтому зовём
// `video.load()` — он заново просит стабильный `/api/...`, сервер подписывает
// свежую ссылку, а мы возвращаем секунду и продолжаем играть.
//
// В Telegram об этом не сообщаем (reportClientError): оборванное видео — это
// человек в метро без сигнала, а не поломка, ради которой будят владельца.
// Сами правила — когда ждать, когда перезагружать, когда сдаться — в
// videoRecoveryController.ts.
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { attachVideoRecovery } from './videoRecoveryController';

/** `failed` — три перезагрузки подряд не помогли, пора показать кнопку;
 * `retry` — её обработчик. Подписка пересоздаётся при смене `src`. */
export function useVideoRecovery(
  videoRef: RefObject<HTMLVideoElement | null>,
  src: string,
): { failed: boolean; retry: () => void } {
  const [failed, setFailed] = useState(false);
  const retryRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const recovery = attachVideoRecovery(video, setFailed);
    retryRef.current = recovery.retry;
    return () => {
      recovery.detach();
      retryRef.current = null;
      // Новый источник начинает с чистого листа: плашка прошлого видео не
      // должна висеть над следующим.
      setFailed(false);
    };
  }, [videoRef, src]);

  const retry = useCallback(() => retryRef.current?.(), []);

  return { failed, retry };
}
