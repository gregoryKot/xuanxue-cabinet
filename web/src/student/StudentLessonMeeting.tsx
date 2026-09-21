// Как попасть на занятие — блок ближайшего занятия (StudentNextLesson.tsx) и
// строки списка (StudentLessonCard.tsx). Онлайн — «Подключиться», офлайн —
// адрес. Формат «both» показывает оба блока: у школы есть занятия, где
// ученик выбирает зал или Zoom сам (CLASS_FORMAT_LABELS_RU: «Офлайн +
// онлайн»). Ссылки нет — честная строка, а не пустота: ученик не должен
// решить, что кабинет забыл её показать.
//
// `prominent` — терракота достаётся ближайшему занятию, ради которого ученик
// и открыл кабинет; у остальных строк та же ссылка идёт текстом (правило
// акцента «один раз на экран», docs/adr/0031, подтверждено ADR-0043). Это же
// делает эту ссылку единственным акцентом на экране ученика — карточка
// «Экзамен» (StudentExamCard.tsx) поэтому держит кнопку вторичной, не залитой.
import type { CSSProperties } from 'react';
import type { ClassFormat } from '@xuanxue/shared';
import { textLinkHitAreaStyle, textLinkLineStyle } from '../components/screenLayout';

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
// Визуально — как Button variant="primary" size="large" (components/
// Button.tsx: те же радиус, паддинг и вес), но это переход по внешней ссылке,
// не действие в кабинете — <a>, не <button>.
const prominentLinkStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 48,
  padding: '13px 20px',
  borderRadius: 'var(--radius-control)',
  fontWeight: 500,
  background: 'var(--terracotta)',
  color: 'var(--terracotta-contrast)',
  textDecoration: 'none',
};
// Цель нажатия 44 несёт оболочка textLinkHitAreaStyle, линию под буквами —
// внутренний span с textLinkLineStyle в JSX ниже: border-bottom на самой
// коробке высотой 44 рисуется по её дну, в отрыве от букв — «Подключиться»
// у занятия висело такой линией на отлёте (снимок владельца 2026-09-21,
// разбор приёма в screenLayout.ts).
const quietLinkStyle: CSSProperties = textLinkHitAreaStyle;
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
  /** Главное действие экрана — заливка терракотой. По умолчанию ссылка тихая. */
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
              {prominent ? JOIN_TEXT : <span style={textLinkLineStyle}>{JOIN_TEXT}</span>}
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
