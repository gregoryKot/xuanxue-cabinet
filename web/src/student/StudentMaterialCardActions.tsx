// Действия строки материала ученика — «Открыть» (ссылка), «Скачать файл»
// (ADR-0057, слой 3.10) или объяснение «закрыто» (ADR-0048). Вынесено из
// StudentMaterialCard.tsx (CLAUDE.md «Компонент React больше 150 — выноси
// хуки и подкомпоненты»).
import type { CSSProperties } from 'react';
import type { MyMaterialDto } from '@xuanxue/shared';
import { materialFilePath } from '../api/apiPaths';
import { textLinkStyle } from '../components/screenLayout';

const OPEN_LABEL = 'Открыть';
// У материала бывает и ссылка, и свой файл — второе действие рядом с
// «Открыть», не вместо него.
const DOWNLOAD_FILE_LABEL = 'Скачать файл';
// VOICE.md: конкретика и действие — что случилось и что сделать дальше;
// текст ADR-0048 уже прошёл эту проверку.
const LOCKED_EXPLANATION =
  'Этот материал школа открывает после оплаты месяца. Напишите в чат школы — там подскажут, как оплатить.';

const actionRowStyle: CSSProperties = {
  marginTop: 8,
  display: 'flex',
  flexWrap: 'wrap',
  gap: 16,
};
const lockedTextStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: 'var(--ink-soft)',
};
// Цель нажатия ≥44 по высоте (CLAUDE.md «Доступность») — тот же приём, что у
// recordingLinkStyle в ArchivedLessonCard.tsx.
const openLinkStyle: CSSProperties = {
  ...textLinkStyle,
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 44,
};

interface StudentMaterialCardActionsProps {
  material: MyMaterialDto;
}

export function StudentMaterialCardActions({
  material,
}: StudentMaterialCardActionsProps) {
  if (material.locked) {
    return (
      <div style={actionRowStyle}>
        <p style={lockedTextStyle}>{LOCKED_EXPLANATION}</p>
      </div>
    );
  }

  return (
    <div style={actionRowStyle}>
      {material.url && (
        <a href={material.url} target="_blank" rel="noreferrer" style={openLinkStyle}>
          {OPEN_LABEL}
        </a>
      )}
      {material.file && (
        // Обычная ссылка, не apiFetch: сервер отвечает 302 на подписанный
        // адрес в другом домене, а `connectSrc: 'self'` в CSP
        // (api/src/security/csp.ts) оборвал бы такой редирект у fetch —
        // навигация по <a href> под CSP не ограничена, не «чинить» на apiFetch.
        <a href={`/api${materialFilePath(material.id)}`} style={openLinkStyle}>
          {DOWNLOAD_FILE_LABEL}
        </a>
      )}
    </div>
  );
}
