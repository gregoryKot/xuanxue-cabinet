// Плашка «Вы в режиме ученика» над всей оболочкой кабинета, пока режим включён
// (ADR-0163): человек с ролью штата видит кабинет без ролей и не должен
// гадать, почему пропали его экраны. Не закрывается: выход из режима — кнопка
// в ней же, на любом экране, а не только в «Профиле».
//
// Стоит в потоке над боковой колонкой и содержимым, не `position: fixed`:
// оболочка ровно в высоту экрана, плашка отнимает свою строку у содержимого,
// а не перекрывает его (и не требует useHistorySheet, CLAUDE.md «Фронтенд»).
// role="status", не "alert": это состояние, а не сбой (тот же довод, что у
// app/NewVersionBanner.tsx) — скринридер объявит его спокойно, когда режим
// включили.
import type { CSSProperties } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { TextLinkButton } from '../components/TextLinkButton';
import { useStudentMode } from './useStudentMode';

const MESSAGE = 'Вы в режиме ученика';
const BACK_LABEL = 'Вернуться к роли';

// Та же рамка макета, что у `shellRowStyle` (appShellStyles.ts): текст плашки
// встаёт над левым краем содержимого, а не по краю окна.
const SHELL_MAX_WIDTH_PX = 1120;

const barStyle: CSSProperties = {
  background: 'var(--panel-warm)',
  borderBottom: '1px solid var(--line)',
  color: 'var(--ink)',
};
const rowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  columnGap: 12,
  maxWidth: SHELL_MAX_WIDTH_PX,
  marginInline: 'auto',
  padding: '0 16px',
};
const messageStyle: CSSProperties = { margin: 0, fontWeight: 500 };
const errorStyle: CSSProperties = {
  margin: 0,
  color: 'var(--danger)',
  flexBasis: '100%',
};

export function StudentModeBanner() {
  const { me } = useAuth();
  const { pending, error, set } = useStudentMode();

  if (!me?.studentMode) return null;

  return (
    <div role="status" style={barStyle}>
      <div style={rowStyle}>
        <p style={messageStyle}>{MESSAGE}</p>
        <TextLinkButton disabled={pending} onClick={() => void set(false)}>
          {BACK_LABEL}
        </TextLinkButton>
        {error && (
          <p role="alert" style={errorStyle}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
