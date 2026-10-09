// Диалог «Что показывать на главной» (ADR-0179): по переключателю на каждую плитку
// своей главной. Поверх общего DialogShell, как диалог объявления: «Назад»
// браузера закрывает его, а не уводит из кабинета. Выбор и запрос — в
// useHomeTilesForm.ts; здесь только то, что видит человек. Сначала одна строка,
// зачем это и что можно вернуть, потом переключатели (CLAUDE.md «Каждая фича
// объясняет…»).
import type { CSSProperties } from 'react';
import type { MeDto } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { DialogShell } from '../components/DialogShell';
import { FormServerError } from '../components/FormServerError';
import { Toggle } from '../components/Toggle';
import { noteStyle } from '../components/screenLayout';
import { homeTileOptions } from './homeTileOptions';
import { useHomeTilesForm } from './useHomeTilesForm';

const TITLE = 'Что показывать на главной';
const INTRO = 'Уберите плитку, если она вам не нужна. Вернуть её можно здесь же.';
const GROUP_LABEL = 'Плитки главной';
const SAVE_LABEL = 'Сохранить';
const CANCEL_LABEL = 'Отмена';

const bodyStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12 };
const groupStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2 };

interface HomeTilesDialogProps {
  me: MeDto;
  /** Видит ли человек штатную главную (`isTeacher(me)`): от этого зависят плитки. */
  isStaffView: boolean;
  applyMe: (next: MeDto) => void;
  onClose: () => void;
}

export function HomeTilesDialog({
  me,
  isStaffView,
  applyMe,
  onClose,
}: HomeTilesDialogProps) {
  const form = useHomeTilesForm(me, isStaffView, applyMe);

  async function save(close: () => void) {
    if (await form.save()) close();
  }

  return (
    <DialogShell
      title={TITLE}
      onClose={onClose}
      renderActions={(close) => (
        <>
          <Button type="button" variant="secondary" onClick={close}>
            {CANCEL_LABEL}
          </Button>
          <Button
            type="button"
            pending={form.pending}
            disabled={!form.hasChanges}
            onClick={() => void save(close)}
          >
            {SAVE_LABEL}
          </Button>
        </>
      )}
    >
      <div style={bodyStyle}>
        <p style={noteStyle}>{INTRO}</p>
        <div role="group" aria-label={GROUP_LABEL} style={groupStyle}>
          {homeTileOptions(isStaffView).map(({ key, label }) => (
            <Toggle
              key={key}
              label={label}
              checked={!form.hidden.includes(key)}
              disabled={form.pending}
              onChange={(show) => form.setShown(key, show)}
            />
          ))}
        </div>
        <FormServerError error={form.error} />
      </div>
    </DialogShell>
  );
}
