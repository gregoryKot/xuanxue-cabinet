// Какие видео-ответы грузятся прямо сейчас — одна отметка на вкладку, чтобы
// «Отправить» не оборвал загрузку молча (аудит 2026-10-01, H: нажатие
// «Отправить» размонтировало AttemptVideoUpload, тот обрывал свои запросы,
// а ученик думал, что видео ушло). Модульное состояние, не React-контекст:
// useVideoUpload.ts живёт у каждого видео-вопроса, а проверка нужна
// подвалу формы (AttemptInProgress.tsx) — тот же приём, что у
// setUnauthorizedListener в api/apiError.ts.
const active = new Set<string>();

export function markUploadActive(key: string, isActive: boolean): void {
  if (isActive) active.add(key);
  else active.delete(key);
}

export function hasActiveUploads(): boolean {
  return active.size > 0;
}

/** Только для тестов — набор живёт на всю вкладку. */
export function resetActiveUploads(): void {
  active.clear();
}
