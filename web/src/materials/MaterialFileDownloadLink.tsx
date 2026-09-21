// Ссылка «Скачать файл» (ADR-0057) — один контрол на три места: поле файла
// на странице материала (MaterialFileField.tsx), строка материала в секции
// даты занятия (planning/LessonMaterialRow.tsx) и карточка библиотеки
// ученика (student/StudentMaterialCardActions.tsx). Три одинаковых <a> с
// одной и той же оговоркой про CSP разъехались бы на первой правке адреса
// (CLAUDE.md «Одна механика — один компонент»).
import type { CSSProperties } from 'react';
import { materialFilePath } from '../api/apiPaths';
import { textLinkStyle } from '../components/screenLayout';

const LABEL = 'Скачать файл';

// Цель нажатия ≥44 по высоте (CLAUDE.md «Доступность») — тот же приём, что у
// recordingLinkStyle в ArchivedLessonCard.tsx.
const linkStyle: CSSProperties = {
  ...textLinkStyle,
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 44,
};

interface MaterialFileDownloadLinkProps {
  materialId: string;
}

export function MaterialFileDownloadLink({ materialId }: MaterialFileDownloadLinkProps) {
  // Обычная ссылка, не apiFetch: сервер отвечает 302 на подписанный адрес в
  // другом домене, а `connectSrc: 'self'` в CSP (api/src/security/csp.ts)
  // оборвал бы такой редирект у fetch — навигация по <a href> под CSP не
  // ограничена. Не «чинить» на apiFetch.
  return (
    <a href={`/api${materialFilePath(materialId)}`} style={linkStyle}>
      {LABEL}
    </a>
  );
}
