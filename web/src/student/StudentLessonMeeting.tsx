// Как попасть на занятие — блок ближайшего занятия (StudentNextLesson.tsx) и
// строки списка (StudentLessonCard.tsx). Онлайн — «Подключиться», офлайн —
// адрес. Формат «both» показывает оба блока: у школы есть занятия, где
// ученик выбирает зал или Zoom сам (CLASS_FORMAT_LABELS_RU: «Офлайн +
// онлайн»). Ссылки нет — честная строка, а не пустота: ученик не должен
// решить, что кабинет забыл её показать.
//
// `prominent` — киноварь достаётся ближайшему занятию, ради которого ученик
// и открыл кабинет; у остальных строк та же ссылка идёт текстом (правило
// акцента «один раз на экран», docs/adr/0031).
import type { CSSProperties } from 'react';
import type { ClassFormat } from '@xuanxue/shared';
import { textLinkStyle } from '../components/screenLayout';

const JOIN_TEXT = 'Подключиться';
const ZOOM_LINK_FALLBACK = 'Ссылку пришлём в канал.';
const LOCATION_FALLBACK = 'Адрес пришлём в канал.';

const wrapStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  marginTop: 8,
};
const zoomRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
};
// Визуально — как Button variant="primary" (components/Button.tsx), но это
// переход по внешней ссылке, не действие в кабинете: <a>, не <button>.
const prominentLinkStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 48,
  padding: '12px 24px',
  borderRadius: 3,
  fontWeight: 600,
  background: 'var(--cinnabar)',
  color: 'var(--cinnabar-contrast)',
  textDecoration: 'none',
};
// Цель нажатия ≥44 по высоте и у тихого варианта (CLAUDE.md «Доступность»).
const quietLinkStyle: CSSProperties = {
  ...textLinkStyle,
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 44,
};
const passwordStyle: CSSProperties = { fontSize: 13, color: 'var(--ink-soft)' };
const plainTextStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: 'var(--ink-soft)',
};

interface StudentLessonMeetingProps {
  format: ClassFormat;
  location?: string;
  zoomLink?: string;
  zoomPassword?: string;
  /** Главное действие экрана — заливка киноварью. По умолчанию ссылка тихая. */
  prominent?: boolean;
}

export function StudentLessonMeeting({
  format,
  location,
  zoomLink,
  zoomPassword,
  prominent,
}: StudentLessonMeetingProps) {
  const showOnline = format === 'online' || format === 'both';
  const showOffline = format === 'offline' || format === 'both';

  return (
    <div style={wrapStyle}>
      {showOnline &&
        (zoomLink ? (
          <div style={zoomRowStyle}>
            <a
              href={zoomLink}
              target="_blank"
              rel="noreferrer"
              style={prominent ? prominentLinkStyle : quietLinkStyle}
            >
              {JOIN_TEXT}
            </a>
            {zoomPassword && <span style={passwordStyle}>Пароль: {zoomPassword}</span>}
          </div>
        ) : (
          <p style={plainTextStyle}>{ZOOM_LINK_FALLBACK}</p>
        ))}
      {showOffline && <p style={plainTextStyle}>{location || LOCATION_FALLBACK}</p>}
    </div>
  );
}
