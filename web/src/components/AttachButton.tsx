// Скрепка — тихая кнопка-иконка рядом с полем текста, заменяет «Добавить
// картинку» и поле видео под ним отдельными строками (отзыв владельца
// 2026-09-27: форма вопроса размазана по вертикали). Один способ медиа
// (видео у формулировки вопроса) — нажатие сразу его запускает, меню не
// нужно; два способа (картинка/видео у варианта ответа) — маленькое меню.
// Сама загрузка — не здесь: пункт меню только сообщает вызывающей стороне,
// что выбрано (CLAUDE.md «Логика вне компонентов»).
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';

export interface AttachMenuItem {
  key: string;
  label: string;
  onSelect: () => void;
}

interface AttachButtonProps {
  /** Доступное имя кнопки — какому полю принадлежит скрепка («Картинка или
   * видео к варианту 2»), их несколько на экране. */
  ariaLabel: string;
  items: AttachMenuItem[];
}

const wrapStyle: CSSProperties = { position: 'relative', display: 'inline-flex' };

const buttonStyle: CSSProperties = {
  width: 44,
  height: 44,
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'transparent',
  border: 'none',
  borderRadius: 'var(--radius-control)',
  color: 'var(--ink-soft)',
  cursor: 'pointer',
};

const menuStyle: CSSProperties = {
  position: 'absolute',
  top: '100%',
  right: 0,
  zIndex: 1,
  marginTop: 4,
  minWidth: 150,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  padding: 4,
  background: 'var(--card)',
  border: '1px solid var(--control-border)',
  borderRadius: 'var(--radius-card)',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
};

const menuItemStyle: CSSProperties = {
  minHeight: 44,
  display: 'flex',
  alignItems: 'center',
  padding: '0 12px',
  background: 'transparent',
  border: 'none',
  borderRadius: 'var(--radius-control)',
  font: 'inherit',
  textAlign: 'left',
  color: 'var(--ink)',
  cursor: 'pointer',
};

export function AttachButton({ ariaLabel, items }: AttachButtonProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const hasMenu = items.length > 1;

  // Закрытие по клику мимо и по Escape — только пока меню открыто: слушатель
  // на весь документ висит не дольше, чем нужно.
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  function handleButtonClick() {
    const only = items[0];
    if (!hasMenu && only) {
      only.onSelect();
      return;
    }
    setOpen((was) => !was);
  }

  function handleItemClick(item: AttachMenuItem) {
    setOpen(false);
    item.onSelect();
  }

  return (
    <div ref={rootRef} style={wrapStyle}>
      <button
        type="button"
        style={buttonStyle}
        aria-label={ariaLabel}
        aria-haspopup={hasMenu ? 'menu' : undefined}
        aria-expanded={hasMenu ? open : undefined}
        aria-controls={hasMenu && open ? menuId : undefined}
        onClick={handleButtonClick}
      >
        {/* aria-hidden — смысл кнопки уже несёт aria-label. */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M8 12.5V7a4 4 0 1 1 8 0v9a2.5 2.5 0 1 1-5 0V8.5"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {hasMenu && open && (
        <div role="menu" id={menuId} aria-label={ariaLabel} style={menuStyle}>
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              style={menuItemStyle}
              onClick={() => handleItemClick(item)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
