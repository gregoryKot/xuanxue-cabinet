// Значок профиля — замена имени в верхней строке телефона (отзыв владельца
// 2026-09-18: «Зачем вообще имя вверху?», AppShellBrandRow.tsx). Свой файл,
// тот же приём, что SchoolMark.tsx: decorative-only, `aria-hidden` — соседняя
// ссылка называет место словами (`aria-label="Профиль"`), скринридеру
// дублировать нечем. Голова и плечи — простой силуэт без сторонних иконных
// библиотек (CLAUDE.md «Зависимости»: предпочитаем встроенное).
import type { CSSProperties } from 'react';

const ICON_SIZE_PX = 20;
const STROKE_WIDTH = 1.5;

const iconStyle: CSSProperties = { display: 'block', flexShrink: 0 };

/** Декоративный: соседняя ссылка называет место словами (`aria-label`). */
export function ProfileIcon() {
  return (
    <svg
      width={ICON_SIZE_PX}
      height={ICON_SIZE_PX}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKE_WIDTH}
      strokeLinecap="round"
      aria-hidden="true"
      style={iconStyle}
    >
      <circle cx="10" cy="6.5" r="3.25" />
      <path d="M3.5 17c0.7-3.6 3.6-5.8 6.5-5.8s5.8 2.2 6.5 5.8" />
    </svg>
  );
}
