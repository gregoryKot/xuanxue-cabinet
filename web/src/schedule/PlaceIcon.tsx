// Значки места в строке «Расписания»: метка на карте — зал или парк, экран —
// Zoom. Тот же приём, что BellIcon.tsx и ProfileIcon.tsx: чистый контур
// цветом текста, без иконных библиотек (CLAUDE.md «Зависимости»).
// Декоративный — рядом то же самое написано словами.
import type { CSSProperties } from 'react';
import type { SlotPlaceKind } from './slotPlace';

const ICON_SIZE_PX = 14;
const STROKE_WIDTH = 1.4;

// Сдвиг вниз — центр значка на середину первой строки (line-height 18px).
const iconStyle: CSSProperties = { display: 'block', flexShrink: 0, marginTop: 2 };

const PATHS: Record<SlotPlaceKind, string[]> = {
  venue: [
    'M8 14.5s4.5-4.2 4.5-7.8A4.5 4.5 0 0 0 3.5 6.7c0 3.6 4.5 7.8 4.5 7.8Z',
    'M8 8.4a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4Z',
  ],
  online: ['M2 3.5h12v8H2z', 'M5.5 14h5', 'M8 11.5V14'],
};

export function PlaceIcon({ kind }: { kind: SlotPlaceKind }) {
  return (
    <svg
      width={ICON_SIZE_PX}
      height={ICON_SIZE_PX}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKE_WIDTH}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={iconStyle}
    >
      {PATHS[kind].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
