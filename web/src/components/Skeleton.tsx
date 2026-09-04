// Скелетоны загрузки (правило CLAUDE.md «форма контента, а не спиннер»):
// пока грузятся данные, показываем плейсхолдер по форме будущего контента.
// Shimmer глушится reduced-motion блоком в index.css. Портировано из
// telegram-bot-2/schema-miniapp/src/components/Skeleton.tsx — структура та
// же, без привязки к Telegram safe-area.
import type { CSSProperties } from 'react';

export function Skeleton({
  w = '100%',
  h = 14,
  radius = 8,
  style,
}: {
  w?: number | string;
  h?: number | string;
  radius?: number;
  style?: CSSProperties;
}) {
  return (
    <div
      aria-hidden
      style={{
        width: w,
        height: h,
        borderRadius: radius,
        flexShrink: 0,
        background:
          'linear-gradient(90deg, var(--surface) 25%, var(--surface-2) 50%, var(--surface) 75%)',
        backgroundSize: '200% auto',
        animation: 'xuanxue-shimmer 1.5s linear infinite',
        ...style,
      }}
    />
  );
}

/** Несколько строк текста разной длины — силуэт абзаца. */
export function SkeletonLines({
  widths = ['80%', '65%', '90%'],
}: {
  widths?: (number | string)[];
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {widths.map((w, i) => (
        <Skeleton key={i} w={w} h={12} radius={6} />
      ))}
    </div>
  );
}

/** Список карточек одной высоты — форма совпадает со строками будущего списка. */
export function SkeletonList({
  rows = 4,
  h = 72,
  gap = 10,
}: {
  rows?: number;
  h?: number;
  gap?: number;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} h={h} radius={16} />
      ))}
    </div>
  );
}
