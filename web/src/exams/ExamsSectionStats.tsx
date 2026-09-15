// Два числа раздела «Экзамены» — сколько работ ждёт проверки и что
// происходит в банке вопросов (CLAUDE.md «Продуктовая фича = число в своём
// разделе», ADR-0025). Раньше — карточки-ссылки components/SectionLink.tsx
// с иконкой; макет (Main.dc.html) заменил их на крупную цифру с подписью,
// здесь — свой, локальный для этого экрана компонент.
//
// «Банк вопросов» — без числа вопросов/опубликованных, которое просит макет:
// `/exam-items/stats-summary` отдаёт только `strugglingCount` (сколько
// вопросов путают больше половины ответивших), общего счётчика банка нет ни
// в одном уже существующем хуке. Гонять сюда весь список вопросов только
// ради количества — новая нагрузка на экран ради одной цифры, решение
// агента: не выдумывать число, оставить прежний честный текст про путающие
// вопросы (CLAUDE.md «Демо-данные в рантайм-коде не живут»).
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { formatExamItemsLinkHint } from '../exam-items/examItemsLinkHint';
import {
  formatGradingQueueCountLabel,
  formatGradingQueueHint,
} from '../grading/gradingQueueHint';

interface ExamsSectionStatsProps {
  /** `null` — список ещё грузится или сбой загрузки. */
  queueCount: number | null;
  /** `null` — сводка вопросов ещё грузится или сбой загрузки. */
  strugglingCount: number | null;
}

const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 28 };
const blockStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 };
const dividerStyle: CSSProperties = { height: 1, background: 'var(--line)' };
const numberRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 10,
};
// Цифра — тушь, не киноварь: акцент экрана уже занят кнопкой «Новый экзамен»
// (CLAUDE.md «Правило акцента» — один раз на экран, ADR-0031).
const numberStyle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 300,
  fontSize: 52,
  lineHeight: 0.9,
  color: 'var(--ink)',
};
const numberLabelStyle: CSSProperties = {
  fontSize: 14,
  color: 'var(--ink-soft)',
  lineHeight: 1.4,
};
const captionStyle: CSSProperties = { margin: 0, fontSize: 13, color: 'var(--ink-soft)' };
const linkStyle: CSSProperties = {
  alignSelf: 'flex-start',
  fontSize: 15,
  borderBottom: '1px solid var(--control-border)',
  paddingBottom: 2,
};

export function ExamsSectionStats({
  queueCount,
  strugglingCount,
}: ExamsSectionStatsProps) {
  return (
    <div style={sectionStyle}>
      <div style={blockStyle}>
        <span className="xuanxue-eyebrow">Ждут проверки</span>
        {queueCount ? (
          <span style={numberRowStyle}>
            <span style={numberStyle}>{queueCount}</span>
            <span style={numberLabelStyle}>
              {formatGradingQueueCountLabel(queueCount)}
            </span>
          </span>
        ) : (
          <p style={captionStyle}>{formatGradingQueueHint(queueCount)}</p>
        )}
        <Link to="/grading" style={linkStyle}>
          Открыть очередь
        </Link>
      </div>

      <div style={dividerStyle} />

      <div style={blockStyle}>
        <span className="xuanxue-eyebrow">Банк вопросов</span>
        <p style={captionStyle}>{formatExamItemsLinkHint(strugglingCount)}</p>
        <Link to="/exam-items" style={linkStyle}>
          Открыть банк
        </Link>
      </div>
    </div>
  );
}
