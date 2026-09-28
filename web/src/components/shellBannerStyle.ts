// Строка-плашка над содержимым оболочки — общий вид у «кабинет обновился»
// (app/NewVersionBanner.tsx) и «поставьте кабинет на телефон»
// (install/InstallAppCard.tsx): текст слева, кнопки справа, на узком экране
// кнопки уходят под текст.
import type { CSSProperties } from 'react';

export const shellBannerStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '12px 16px',
  background: 'var(--panel-warm)',
  color: 'var(--ink)',
};
