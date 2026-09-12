// Как попасть на занятие — блок карточки StudentLessonCard (ТЗ
// student-screen.md, п.2): онлайн — заметная ссылка-кнопка «Открыть Zoom» и
// пароль рядом, офлайн — адрес. Формат «both» показывает оба блока — у школы
// есть занятия, где ученик выбирает зал или Zoom сам (CLASS_FORMAT_LABELS_RU:
// «Офлайн + онлайн»). Ссылки нет — честная строка, а не пустота: ученик не
// должен решить, что кабинет забыл её показать.
import type { CSSProperties } from 'react';
import type { ClassFormat } from '@xuanxue/shared';

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
  gap: 10,
  flexWrap: 'wrap',
};
// Визуально — как Button variant="primary" (components/Button.tsx), но это
// переход по внешней ссылке, не действие в кабинете: <a>, не <button>
// (тот же приём, что components/SectionLink.tsx).
const zoomLinkStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 44,
  padding: '10px 18px',
  borderRadius: 8,
  fontWeight: 600,
  background: 'var(--accent)',
  color: 'var(--accent-contrast)',
  textDecoration: 'none',
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
}

export function StudentLessonMeeting({
  format,
  location,
  zoomLink,
  zoomPassword,
}: StudentLessonMeetingProps) {
  const showOnline = format === 'online' || format === 'both';
  const showOffline = format === 'offline' || format === 'both';

  return (
    <div style={wrapStyle}>
      {showOnline &&
        (zoomLink ? (
          <div style={zoomRowStyle}>
            <a href={zoomLink} target="_blank" rel="noreferrer" style={zoomLinkStyle}>
              Открыть Zoom
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
