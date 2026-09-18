// Числа сводки вверху «Рассылок» (CLAUDE.md «Продуктовая фича = число в своём
// разделе», docs/adr/0043). Раньше это была тихая строка без рамок (ADR-0031)
// с пятью числами; макет «Тёплой школы» вернул карточки, но не для всех пяти —
// «Ждут отправки вручную» теперь считает сама плашка
// (ManualDeliveriesSection.tsx: там же список, число рядом с ним честнее).
// Макет рисует три карточки, здесь их четыре: почему «Отменено автоматикой»
// осталось — у самого числа в `numbersOf` ниже. Число рисует общий
// components/StatNumber.tsx (CLAUDE.md «Одна механика — один компонент»).
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { SummaryDto } from '@xuanxue/shared';
import { StatNumber } from '../components/StatNumber';

// auto-fit/minmax, не жёсткий repeat(3, 1fr): на 360px три карточки по
// 140px не влезают, и они сами перестраиваются в две колонки без
// медиазапроса (CSSProperties его не умеет, макет только настольный).
const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
  gap: 12,
};
const cardStyle: CSSProperties = {
  padding: '16px 18px',
  borderRadius: 'var(--radius-block)',
  background: 'var(--card)',
  boxShadow: 'var(--shadow-card)',
};
const valueSizeStyle: CSSProperties = { fontSize: 26 };

/** Карточка-ссылка: та же карточка, но кликается целиком, поэтому гасим
 * системный синий и подчёркивание — цвет текста задают само число и подпись. */
const linkCardStyle: CSSProperties = {
  ...cardStyle,
  display: 'block',
  color: 'inherit',
  textDecoration: 'none',
};

// Подпись числа-ссылки — линия под текстом вместо подчёркивания, как у
// остальных текстовых ссылок кабинета (components/screenLayout.ts): без неё
// карточка ничем не показывает, что по ней переходят.
const linkLabelStyle: CSSProperties = {
  alignSelf: 'flex-start',
  borderBottom: '1px solid var(--control-border)',
  paddingBottom: 2,
};

interface SummaryNumber {
  value: number;
  label: string;
  valueStyle?: CSSProperties;
  /** Число ведёт в журнал с готовым фильтром — «Отменено автоматикой». */
  href?: string;
}

function numbersOf(summary: SummaryDto): SummaryNumber[] {
  return [
    { value: summary.broadcastsSent, label: 'Ушло за 30 дней' },
    { value: summary.deliveriesPending, label: 'Ждут отправки' },
    {
      value: summary.deliveriesFailed,
      label: 'Не отправилось',
      // 8.34:1 на белой карточке — сбой всегда виден, даже мельком.
      valueStyle: { color: 'var(--danger)' },
    },
    // Четвёртая карточка, которой в макете нет: он рисует ровно три. Число
    // оставлено осознанно — отменённая автоматикой рассылка это несостоявшаяся
    // отправка, то есть ровно тот тихий отказ, который CLAUDE.md называет самой
    // дорогой ошибкой в продукте про рассылки. Убрать его отсюда значит убрать
    // и единственный короткий путь к этим записям: журнал по такому фильтру
    // больше ниоткуда не открывается. Сетка auto-fit принимает четвёртую
    // карточку без правки раскладки. Если владелец решит, что число лишнее, —
    // удаляется одной строкой вместе со ссылкой.
    {
      value: summary.broadcastsCancelled,
      label: 'Отменено автоматикой',
      href: '/broadcasts?status=cancelled',
    },
  ];
}

export function SummaryNumbers({ summary }: { summary: SummaryDto }) {
  return (
    <div style={gridStyle}>
      {numbersOf(summary).map((number) => {
        const stat = (
          <StatNumber
            value={number.value}
            label={number.label}
            valueStyle={{ ...valueSizeStyle, ...number.valueStyle }}
            labelStyle={number.href ? linkLabelStyle : undefined}
          />
        );
        // Ссылкой становится вся карточка, а не одна подпись: подпись 13px —
        // цель нажатия меньше 44 (CLAUDE.md «Доступность»).
        return number.href ? (
          <Link key={number.label} to={number.href} style={linkCardStyle}>
            {stat}
          </Link>
        ) : (
          <div key={number.label} style={cardStyle}>
            {stat}
          </div>
        );
      })}
    </div>
  );
}
