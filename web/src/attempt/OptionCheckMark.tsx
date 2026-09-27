// Галочка внутри отметки варианта — свой inline-SVG (иконной библиотеки в
// проекте нет, CLAUDE.md «Зависимости»; тот же приём, что NavIcon.tsx и
// ChevronIcon.tsx). Отдельным файлом — AttemptOptionTile.tsx упирался в
// файловый храповик.
const CHECK_ICON_SIZE_PX = 14;
const CHECK_STROKE_WIDTH = 2.4;

export function CheckMark() {
  return (
    <svg
      width={CHECK_ICON_SIZE_PX}
      height={CHECK_ICON_SIZE_PX}
      viewBox="0 0 16 16"
      fill="none"
      stroke="var(--terracotta-contrast)"
      strokeWidth={CHECK_STROKE_WIDTH}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 8.5 6.5 12 13 4.5" />
    </svg>
  );
}
