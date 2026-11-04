// Подвал страницы занятия: «Сохранить» и, у существующего занятия, удаление
// (само подтверждение — ConfirmDialog в ClassEditorForm). Вынесен, чтобы форма
// не пухла за 150 строк.
import { Button } from '../components/Button';
import {
  editorActionsRowStyle,
  editorDangerButtonStyle,
  editorDangerRowStyle,
  editorSectionStyle,
} from '../components/editorLayout';

const REMOVE_LABEL = 'Удалить из расписания';

interface ClassEditorFooterProps {
  pending: boolean;
  saveDisabled: boolean;
  /** `null` — занятия ещё нет, удалять нечего. */
  onRemove: (() => void) | null;
}

export function ClassEditorFooter({
  pending,
  saveDisabled,
  onRemove,
}: ClassEditorFooterProps) {
  return (
    <div style={editorSectionStyle}>
      <div style={editorActionsRowStyle}>
        <Button type="submit" pending={pending} disabled={saveDisabled}>
          Сохранить
        </Button>
      </div>

      {onRemove && (
        <div style={editorDangerRowStyle}>
          <Button
            type="button"
            variant="danger"
            style={editorDangerButtonStyle}
            pending={pending}
            onClick={onRemove}
          >
            {REMOVE_LABEL}
          </Button>
        </div>
      )}
    </div>
  );
}
