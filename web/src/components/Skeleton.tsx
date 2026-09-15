// Скелетоны загрузки (правило CLAUDE.md «форма контента, а не спиннер»):
// пока грузятся данные, показываем плейсхолдер по форме будущего контента.
// Shimmer глушится reduced-motion блоком в index.css. Портировано из
// telegram-bot-2/schema-miniapp/src/components/Skeleton.tsx — структура та
// же, без привязки к Telegram safe-area.
//
// Тона взяты не из --surface/--surface-2 (подложка/бумага, направление
// «тихо и благородно»): подложка почти сливается с бумагой страницы
// (контраст 1.06:1), и скелетон на самой бумаге стал бы не «светиться
// серым», а попросту исчезать. --border (линия) заметно темнее бумаги и
// держит скелетон видимым, откуда бы он ни рендерился.
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
          'linear-gradient(90deg, var(--border) 25%, var(--surface) 50%, var(--border) 75%)',
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

/** Сетка карточек одной высоты — форма совпадает с сеткой чисел «Сводки»
 * (`repeat(auto-fit, minmax(150px, 1fr))`), не вертикальный список. */
export function SkeletonGrid({ items = 5, h = 64 }: { items?: number; h?: number }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: 10,
      }}
    >
      {Array.from({ length: items }).map((_, i) => (
        <Skeleton key={i} h={h} radius={12} />
      ))}
    </div>
  );
}
