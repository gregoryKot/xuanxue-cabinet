// Предупреждение браузера «покинуть сайт?» на время загрузки видео (отзыв
// владельца с телефона): закрыть вкладку или уйти по ссылке посреди отправки
// обрывает запросы — загрузка встаёт без единого слова, если ничего не держит.
// Включает его общий загрузчик (video-upload/useVideoUpload.ts) — для видео
// вопроса и видео ответа одинаково (ADR-0165).
// `beforeunload` — стандартный способ вызвать диалог браузера; текст диалога
// браузер решает сам (`returnValue` — устаревшее API, но других механизмов
// нет), поэтому строка со смыслом того же самого рисуется отдельно на экране
// (video-upload/VideoUploadProgress.tsx), не полагается на текст этого диалога.
import { useEffect } from 'react';

function handleBeforeUnload(event: BeforeUnloadEvent): void {
  event.preventDefault();
  // Присвоение, не просто preventDefault — часть браузеров (Chrome) диалог
  // показывает только при непустом returnValue.
  event.returnValue = '';
}

/** `active` — включает предупреждение, пока идёт хотя бы одна загрузка
 * видео (сжатие, части, пауза перед повтором). Слушатель снимается сразу, как только `active` становится false —
 * иначе диалог всплывал бы при уходе со страницы и после успешной загрузки. */
export function useWarnBeforeUnload(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [active]);
}
