// Ход загрузки видео (отзыв владельца с телефона 2026-09-27: «можно в
// процентах? нужно ли оставаться на странице?»). Процент — когда XHR его
// сообщил (uploadWithProgress.ts), иначе просто «Загружаем…»; строка ниже
// объясняет, почему нельзя уходить, а useWarnBeforeUnload на время загрузки
// включает диалог браузера «покинуть сайт?».
import type { CSSProperties } from 'react';
import { useWarnBeforeUnload } from '../hooks/useWarnBeforeUnload';
import { RichText } from './RichText';
import { noteStyle } from './screenLayout';

const PENDING_TEXT = 'Загружаем…';
const STAY_ON_PAGE_HINT =
  'Не закрывайте страницу, пока видео **грузится**: иначе загрузка ' +
  'оборвётся и придётся начать заново.';

const wrapStyle: CSSProperties = {
  flexBasis: '100%',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  maxWidth: 360,
};
const rowStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 };
const progressStyle: CSSProperties = { width: 120, height: 8 };

/** Подпись с процентом, когда доля известна; `lengthComputable` у события
 * прогресса бывает false — тогда без числа. */
export function pendingLabel(progress: number | null): string {
  if (progress == null) return PENDING_TEXT;
  return `${PENDING_TEXT} ${Math.round(progress * 100)} %`;
}

export function UploadProgress({ progress }: { progress: number | null }) {
  useWarnBeforeUnload(true);
  return (
    <div style={wrapStyle} aria-busy="true">
      <span style={rowStyle}>
        {pendingLabel(progress)}
        {progress != null && (
          // Нативный <progress>: роль progressbar и aria-valuenow браузер
          // ставит сам (CLAUDE.md «Доступность»).
          <progress value={progress} max={1} style={progressStyle} />
        )}
      </span>
      <p style={noteStyle}>
        <RichText text={STAY_ON_PAGE_HINT} />
      </p>
    </div>
  );
}
