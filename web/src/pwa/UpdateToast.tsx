// Тост «доступна новая версия» (ADR-0006, CLAUDE.md «Приложение на телефоне»):
// registerType 'prompt' не обновляет SW сам, ждёт нажатия кнопки — иначе можно
// потерять несохранённые правки прямо на середине занятия.
//
// Стили — инлайн, не CSS-модуль: web/src/index.css вне зоны этой задачи, а
// поведение vitest с *.module.css при `test.css` не заданном (по умолчанию
// выключено) не стоит того, чтобы тянуть в такой маленький компонент.
import type { CSSProperties } from 'react';
import { useServiceWorkerUpdate } from './useServiceWorkerUpdate';

const toastStyle: CSSProperties = {
  position: 'fixed',
  left: 12,
  right: 12,
  bottom: 'calc(12px + env(safe-area-inset-bottom))',
  zIndex: 100,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '12px 16px',
  borderRadius: 12,
  background: '#1f3b2f',
  color: '#f2f0ed',
  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.24)',
  fontFamily: 'system-ui, sans-serif',
};

const actionsStyle: CSSProperties = { display: 'flex', gap: 8, flexShrink: 0 };

const buttonBaseStyle: CSSProperties = {
  minHeight: 44,
  minWidth: 44,
  padding: '8px 14px',
  borderRadius: 8,
  border: 'none',
  font: 'inherit',
  fontWeight: 600,
  cursor: 'pointer',
};

const primaryButtonStyle: CSSProperties = {
  ...buttonBaseStyle,
  background: '#f2f0ed',
  color: '#1f3b2f',
};

const secondaryButtonStyle: CSSProperties = {
  ...buttonBaseStyle,
  background: 'transparent',
  color: '#f2f0ed',
};

export function UpdateToast() {
  const { needRefresh, update, dismiss } = useServiceWorkerUpdate();

  if (!needRefresh) return null;

  return (
    <div role="status" aria-live="polite" style={toastStyle}>
      <p style={{ margin: 0 }}>Появилась новая версия</p>
      <div style={actionsStyle}>
        <button
          type="button"
          style={primaryButtonStyle}
          onClick={() => {
            void update();
          }}
        >
          Обновить
        </button>
        <button type="button" style={secondaryButtonStyle} onClick={dismiss}>
          Позже
        </button>
      </div>
    </div>
  );
}
