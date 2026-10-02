// Где проходит занятие — значок и адрес зала или парка, «Онлайн» или
// «… и онлайн». Одна механика на «Расписание» (SlotRow.tsx), «Занятия»
// (planning/LessonCard.tsx) и «Сегодня» (planning/TodayLessonCard.tsx):
// владелец попросил помечать занятия онлайн и в парке везде, где они видны
// списком (2026-10-02), а копия разметки в трёх местах разошлась бы при
// первой правке (CLAUDE.md «Одна механика — один компонент»).
import type { CSSProperties } from 'react';
import type { ClassFormat } from '@xuanxue/shared';
import { PlaceIcon } from './PlaceIcon';
import { slotPlaceParts } from './slotPlace';

// Информационный текст — --ink-soft, не --ink-faint (CLAUDE.md
// «Доступность»: у --ink-faint контраст с бумагой ниже AA).
const placeRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  columnGap: 10,
  rowGap: 2,
  fontSize: 13,
  color: 'var(--ink-soft)',
  overflowWrap: 'anywhere',
};
// Значок по первой строке текста, а не по середине: длинный адрес
// переносится, и значок по центру висел бы между строк.
const placePartStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'flex-start',
  gap: 5,
  lineHeight: '18px',
};

interface ClassPlaceProps {
  format: ClassFormat;
  location?: string;
}

export function ClassPlace({ format, location }: ClassPlaceProps) {
  return (
    <span style={placeRowStyle}>
      {slotPlaceParts(format, location).map((part) => (
        <span key={part.kind} style={placePartStyle}>
          <PlaceIcon kind={part.kind} />
          {part.text}
        </span>
      ))}
    </span>
  );
}
