// Стили экрана входа вынесены из LoginScreen.tsx — тот же приём, что у
// components/screenLayout.ts и components/listCardStyles.ts (CLAUDE.md
// «Одна механика — один компонент»): компонент с версткой инлайном не
// помещался бы в лимит файлового храповика. Карточка по центру экрана и по
// вертикали, и по горизонтали (отзыв владельца: «уродливая форма») — тот же
// визуальный язык, что у карточек списков (listCardStyles.ts) и
// SectionLink.tsx: белый фон, `border: var(--border)`, `borderRadius: 12`.
import type { CSSProperties } from 'react';

const CARD_MAX_WIDTH_PX = 360;

// `100dvh`, не `100vh`: на телефоне адресная строка браузера то есть, то
// нет, и `100vh` даёт скролл в несколько пикселей на каждое такое изменение.
export const loginPageStyle: CSSProperties = {
  minHeight: '100dvh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
};

export const loginCardStyle: CSSProperties = {
  width: '100%',
  maxWidth: CARD_MAX_WIDTH_PX,
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  padding: 28,
  borderRadius: 12,
  border: '1px solid var(--border)',
  background: '#fff',
  textAlign: 'center',
};

export const loginTitleStyle: CSSProperties = { fontSize: 22, margin: 0 };
export const loginExplanationStyle: CSSProperties = {
  margin: 0,
  color: 'var(--ink-soft)',
};
export const loginCaptionStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: 'var(--ink-soft)',
};

// Разделитель перед формой входа по email (LoginScreen.tsx) — только линия,
// без «или» текстом: подпись под блоком уже объясняет, что это альтернатива.
export const loginDividerStyle: CSSProperties = {
  border: 0,
  borderTop: '1px solid var(--border)',
  margin: 0,
  width: '100%',
};
