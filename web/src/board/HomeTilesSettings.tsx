// Тихая кнопка «Настроить главную» внизу главной (ADR-0179) и диалог по её
// нажатию. Стоит после всех плиток — у ученика после последней, у штата после
// сетки входов: это настройка, а не действие экрана, и главным она не должна
// выглядеть (CLAUDE.md «Одно очевидное главное действие на экран»). Роль для
// списка плиток — `isTeacher(me)`: штат в режиме ученика видит главную ученика
// и настраивает её (ADR-0163).
import { useState } from 'react';
import { isTeacher } from '../app/screenAccess';
import { useAuth } from '../auth/AuthProvider';
import { TextLinkButton } from '../components/TextLinkButton';
import { HomeTilesDialog } from './HomeTilesDialog';

const OPEN_LABEL = 'Настроить главную';

export function HomeTilesSettings() {
  const { me, applyMe } = useAuth();
  const [open, setOpen] = useState(false);
  if (!me) return null;

  return (
    <>
      <TextLinkButton onClick={() => setOpen(true)}>{OPEN_LABEL}</TextLinkButton>
      {open && (
        <HomeTilesDialog
          me={me}
          isStaffView={isTeacher(me)}
          applyMe={applyMe}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
