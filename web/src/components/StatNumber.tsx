// Крупное число раздела — общий компонент, а не просто стиль (CLAUDE.md
// «Одна механика — один компонент», «Продуктовая фича = число в своём
// разделе»): у «Экзаменов» и «Рассылок» повторялась не только пара свойств
// шрифта, но и вся разметка «число + подпись» — и кегли числа разошлись
// (52px и 30px), потому что общей механики не было и разъезд было некому
// поймать.
//
// Гротеск, не антиква: направление «Тёплая школа» (docs/adr/0043-visual-
// direction-warm-school.md) отдаёт цифры интерфейсному гротеску Golos Text.
// Светлая антиква (Cormorant Garamond 300) на кегле 52 давала голый штрих —
// единица читалась как римская «I» (снимок владельца с экрана «Экзамены»).
import type { CSSProperties } from 'react';

// Колонка — разметка по умолчанию: число над подписью, как в «Рассылках».
// «Экзамены» показывают число и подпись в строку по базовой линии и передают
// свой `style`.
const wrapperStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2 };

// Цифра — тушь, не акцент: на экране раздела акцент уже занят главной кнопкой
// («Новый экзамен», «Новая рассылка»), а он бывает один раз на экран (CLAUDE.md
// «Правило акцента», правило сохранено в ADR-0043). Причина жила в
// exams/ExamsSectionStats.tsx, пока число рисовал он сам, — переехала сюда
// вместе с механикой.
//
// `fontVariantNumeric: 'tabular-nums'` — цифры моноширинные: в макете
// «Рассылок» карточки чисел стоят в ряд и время в журнале набрано тем же
// приёмом. Без него «48» и «11» разной ширины, и колонка/строка дёргается
// при каждом обновлении числа (docs/adr/0043).
const defaultValueStyle: CSSProperties = {
  fontFamily: 'var(--font-text)',
  fontWeight: 500,
  fontSize: 27,
  lineHeight: 1.1,
  color: 'var(--ink)',
  fontVariantNumeric: 'tabular-nums',
};

const defaultLabelStyle: CSSProperties = { fontSize: 13, color: 'var(--ink-soft)' };

interface StatNumberProps {
  value: number;
  label: string;
  /** Разметка обёртки целиком — по умолчанию колонка; экран передаёт свою,
   * когда число и подпись должны стоять в строку (exams/ExamsSectionStats.tsx). */
  style?: CSSProperties;
  /** Точечная правка вида самого числа — кегль 26px и красный цвет
   * «Не отправилось» у карточек «Рассылок» (broadcasts/SummaryNumbers.tsx):
   * повод завести проп, а не четвёртую копию компонента (CLAUDE.md «Одна
   * механика — один компонент»). */
  valueStyle?: CSSProperties;
  /** Точечная правка подписи поверх вида по умолчанию — симметрично
   * valueStyle, для чисел-ссылок (подпись тогда ещё и подчёркнута). */
  labelStyle?: CSSProperties;
}

export function StatNumber({
  value,
  label,
  style,
  valueStyle,
  labelStyle,
}: StatNumberProps) {
  return (
    <span style={{ ...wrapperStyle, ...style }}>
      <span style={{ ...defaultValueStyle, ...valueStyle }}>{value}</span>
      <span style={{ ...defaultLabelStyle, ...labelStyle }}>{label}</span>
    </span>
  );
}
