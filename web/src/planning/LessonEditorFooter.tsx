// Подвал страницы занятия: «Сохранить» — единственная заливка терракотой на
// экране, отмена занятия — текстом под волосяной линией (раскладка общая с
// components/EditorFooter.tsx, стили — components/screenLayout.ts).
// Статусов draft/published у занятия нет, поэтому общий EditorFooter не
// подходит: здесь пара «отменить занятие» ↔ «вернуть в расписание».
import { Button } from '../components/Button';
import {
  editorActionsRowStyle,
  editorDangerButtonStyle,
  editorDangerRowStyle,
} from '../components/editorLayout';

interface LessonEditorFooterProps {
  /** `false` — разовое занятие ещё не создано: отменять нечего. */
  saved: boolean;
  cancelled: boolean;
  pending: boolean;
  onRestore: () => void;
  onRequestCancel: () => void;
}

export function LessonEditorFooter({
  saved,
  cancelled,
  pending,
  onRestore,
  onRequestCancel,
}: LessonEditorFooterProps) {
  return (
    <>
      <div style={editorActionsRowStyle}>
        <Button type="submit" pending={pending}>
          Сохранить
        </Button>
        {cancelled && (
          <Button type="button" variant="secondary" pending={pending} onClick={onRestore}>
            Вернуть в расписание
          </Button>
        )}
      </div>

      {saved && !cancelled && (
        <div style={editorDangerRowStyle}>
          <Button
            type="button"
            variant="danger"
            style={editorDangerButtonStyle}
            pending={pending}
            onClick={onRequestCancel}
          >
            Отменить занятие
          </Button>
        </div>
      )}
    </>
  );
}
