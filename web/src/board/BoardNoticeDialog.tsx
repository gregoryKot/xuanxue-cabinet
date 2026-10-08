// Диалог объявления ученикам на доске штата (ADR-0172, дополнение
// 2026-10-07): текст, последний день показа, «Сохранить» и, у уже висящего
// объявления, «Убрать». Поверх общего DialogShell — тот же слой, что у
// подтверждений: «Назад» браузера закрывает диалог, не уводит из кабинета.
// Логика формы — useBoardNoticeForm.ts; здесь только то, что видит учитель.
import type { CSSProperties } from 'react';
import {
  SETTINGS_LIMITS,
  type SettingsDto,
  type UpdateSettingsInput,
} from '@xuanxue/shared';
import { Button } from '../components/Button';
import { DialogShell } from '../components/DialogShell';
import { Field, inputStyle } from '../components/Field';
import { FormServerError } from '../components/FormServerError';
import { tzBadge } from '../schedule/timezoneLabel';
import { useBoardNoticeForm } from './useBoardNoticeForm';

const TITLE_NEW = 'Объявление ученикам';
const TITLE_EDIT = 'Изменить объявление';
const TEXT_LABEL = 'Текст';
const TEXT_HINT =
  'Например: ретрит в ноябре — **оплата до 20 октября Маше**. Каждый ученик увидит его на главной.';
const UNTIL_LABEL = 'Показывать до';
const UNTIL_HINT = 'В **последний день** объявление ещё видно, на следующий исчезает.';
const SAVE_LABEL = 'Сохранить';
const CANCEL_LABEL = 'Отмена';
const REMOVE_LABEL = 'Убрать';

const dateInputStyle: CSSProperties = { ...inputStyle, width: 200 };
const bodyStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12 };

interface BoardNoticeDialogProps {
  settings: SettingsDto;
  update: (input: UpdateSettingsInput) => Promise<void>;
  onClose: () => void;
}

export function BoardNoticeDialog({ settings, update, onClose }: BoardNoticeDialogProps) {
  const notice = useBoardNoticeForm(settings, update);
  const hasSaved = Boolean(settings.boardNotice);
  const schoolTz = tzBadge(settings.tz);
  const untilHint = schoolTz
    ? `${UNTIL_HINT} Дата по часам школы (**${schoolTz}**).`
    : UNTIL_HINT;

  async function save(close: () => void) {
    if (await notice.save()) close();
  }

  // «Убрать» — тот же сброс, что пустой текст в форме (`boardNotice: null`),
  // но одной кнопкой: стирать текст, чтобы снять объявление, не догадаться.
  async function remove(close: () => void) {
    notice.setText('');
    await update({ boardNotice: null });
    close();
  }

  return (
    <DialogShell
      title={hasSaved ? TITLE_EDIT : TITLE_NEW}
      onClose={onClose}
      renderActions={(close) => (
        <>
          <Button type="button" variant="secondary" onClick={close}>
            {CANCEL_LABEL}
          </Button>
          {hasSaved && (
            <Button type="button" variant="danger" onClick={() => void remove(close)}>
              {REMOVE_LABEL}
            </Button>
          )}
          <Button
            type="button"
            pending={notice.pending}
            disabled={!notice.hasChanges}
            onClick={() => void save(close)}
          >
            {SAVE_LABEL}
          </Button>
        </>
      )}
    >
      <div style={bodyStyle}>
        <Field label={TEXT_LABEL} hint={TEXT_HINT}>
          <textarea
            style={{ ...inputStyle, minHeight: 88 }}
            maxLength={SETTINGS_LIMITS.boardNoticeTextMaxLength}
            value={notice.form.text}
            onChange={(event) => notice.setText(event.target.value)}
          />
        </Field>
        <Field label={UNTIL_LABEL} hint={untilHint}>
          <input
            type="date"
            style={dateInputStyle}
            value={notice.form.until}
            onChange={(event) => notice.setUntil(event.target.value)}
          />
        </Field>
        <FormServerError error={notice.error} />
      </div>
    </DialogShell>
  );
}
