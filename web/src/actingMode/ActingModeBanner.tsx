// Плашка «Вы в режиме ученика» / «Вы в режиме учителя» над всей оболочкой кабинета,
// пока режим включён (ADR-0163, ADR-0190): человек видит кабинет с урезанными
// ролями и не должен гадать, почему пропали его экраны. Не закрывается: выход
// из режима — кнопка в ней же, на любом экране, а не только в «Профиле».
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
import { ACTING_MODES, activeActingMode, type ActingMode } from './actingModes';
import { useActingMode } from './useActingMode';

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

export function ActingModeBanner() {
  const { me } = useAuth();
  const mode = activeActingMode(me);
  return mode && <ModeBar mode={mode} />;
}

// Отдельный компонент: хук режима нельзя звать условно, а режим известен
// только после того, как пришёл профиль.
function ModeBar({ mode }: { mode: ActingMode }) {
  const { pending, error, set } = useActingMode(mode);

  return (
    <div role="status" style={barStyle}>
      <div style={rowStyle}>
        <p style={messageStyle}>{ACTING_MODES[mode].bannerMessage}</p>
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
