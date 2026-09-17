// Числа за период — верх «Рассылок» (CLAUDE.md «Продуктовая фича = число в
// своём разделе», docs/adr/0025). Одна тихая строка: значение антиквой,
// подпись под ним тусклым. Раньше это были пять карточек с рамкой на белом
// (SummaryCard.tsx) — стопка визиток поверх журнала (отзыв владельца
// 2026-09-16, docs/adr/0031: рамок и подложек направление не знает).
//
// «Отменено автоматикой» ведёт в журнал ниже с готовым фильтром — ссылкой
// становится вся колонка числа, не одна подпись: подпись 13 px — цель
// нажатия меньше 44 (CLAUDE.md «Доступность»).
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { SummaryDto } from '@xuanxue/shared';

const rowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  // На 360 px числа переносятся по два-три в ряд — колонка узкая, но не
  // рвётся на одно число в строке.
  columnGap: 32,
  rowGap: 16,
};
const itemStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  minHeight: 44,
  color: 'var(--ink)',
  textDecoration: 'none',
};
const valueStyle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 300,
  fontSize: 30,
  lineHeight: 1.1,
};
const labelStyle: CSSProperties = { fontSize: 13, color: 'var(--ink-soft)' };
// Подпись-ссылка: линия под текстом вместо подчёркивания, как у остальных
// текстовых ссылок кабинета (components/screenLayout.ts, textLinkStyle).
const linkLabelStyle: CSSProperties = {
  ...labelStyle,
  alignSelf: 'flex-start',
  borderBottom: '1px solid var(--control-border)',
  paddingBottom: 2,
};

interface SummaryNumber {
  value: number;
  label: string;
  href?: string;
}

function numbersOf(summary: SummaryDto): SummaryNumber[] {
  return [
    { value: summary.broadcastsSent, label: 'Рассылок отправлено' },
    { value: summary.deliveriesFailed, label: 'Ошибок доставки' },
    { value: summary.deliveriesPending, label: 'Ждут отправки' },
    { value: summary.manualWaiting, label: 'Ждут отправки вручную' },
    {
      value: summary.broadcastsCancelled,
      label: 'Отменено автоматикой',
      href: '/broadcasts?status=cancelled',
    },
  ];
}

export function SummaryNumbers({ summary }: { summary: SummaryDto }) {
  return (
    <div style={rowStyle}>
      {numbersOf(summary).map((number) => {
        const content: ReactNode = (
          <>
            <span style={valueStyle}>{number.value}</span>
            <span style={number.href ? linkLabelStyle : labelStyle}>{number.label}</span>
          </>
        );
        return number.href ? (
          <Link key={number.label} to={number.href} style={itemStyle}>
            {content}
          </Link>
        ) : (
          <div key={number.label} style={itemStyle}>
            {content}
          </div>
        );
      })}
    </div>
  );
}
