// Верх страницы редактора экзамена (ExamEditorForm.tsx, ADR-0139): ссылка
// «назад» и (у черновика) «Удалить экзамен» одной строкой, заголовок со
// строкой статуса («Опубликовать» / «В архив»), ряд действий с «Сохранить» и
// заметкой про несохранённые правки. Вынесено в отдельный файл ровно из-за
// храповика размера (CLAUDE.md «Храповики», 150 строк) — сама форма с этим
// блоком внутри выросла выше потолка.
import { Link } from 'react-router-dom';
import type { ExamDto, ExamStatus } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { EditorStatusRow } from '../components/EditorStatusRow';
import { noteStyle, screenTitleStyle } from '../components/screenLayout';
import { TextLinkButton } from '../components/TextLinkButton';
import {
  backLinkStyle,
  editorActionsRowStyle,
  editorHeadingStyle,
  editorTopRowStyle,
} from '../components/editorLayout';
import { EXAM_STATUS_EXPLANATIONS } from './ExamEditorFooter';

export const EXAMS_PATH = '/exams';
const BACK_TEXT = 'К списку экзаменов';
const NEW_EXAM_TITLE = 'Новый экзамен';
const REMOVE_LABEL = 'Удалить экзамен';
// «Не потерялось» — вместо тишины после первого захода на пустую форму:
// владелец опасался уйти со страницы, не зная, что новый экзамен уже держит
// черновик в этом браузере (ADR-0052) — то же самое, что бережёт FormDraftNote
// при возврате, но на этот раз до первого сохранения.
const DRAFT_SAFETY_NOTE = 'Пока не сохранили, набранное хранится на этом устройстве.';

interface ExamEditorHeaderProps {
  /** `null` — новый экзамен, ни статуса, ни удаления ещё нет. */
  exam: ExamDto | null;
  pending: boolean;
  /** Заметка «пока не сохранили» — у нового экзамена или при несохранённых
   * правках (hasUnsavedChanges, useSaveAndPreview.ts). */
  showDraftSafetyNote: boolean;
  onChangeStatus: (status: ExamStatus) => void;
  onRequestRemove: () => void;
}

export function ExamEditorHeader({
  exam,
  pending,
  showDraftSafetyNote,
  onChangeStatus,
  onRequestRemove,
}: ExamEditorHeaderProps) {
  return (
    <>
      <div style={editorTopRowStyle}>
        <Link to={EXAMS_PATH} style={backLinkStyle}>
          {BACK_TEXT}
        </Link>
        {/* Удаление разрешено только черновику (ExamsService.remove) — то
            же условие, что раньше решало, рисовать ли кнопку в подвале. */}
        {exam && exam.status === 'draft' && (
          <TextLinkButton onClick={onRequestRemove} disabled={pending} danger>
            {REMOVE_LABEL}
          </TextLinkButton>
        )}
      </div>

      <div style={editorHeadingStyle}>
        <span className="xuanxue-eyebrow">Экзамен</span>
        <h1 style={screenTitleStyle}>{exam ? exam.title : NEW_EXAM_TITLE}</h1>
        {exam && (
          <EditorStatusRow
            status={exam.status}
            explanations={EXAM_STATUS_EXPLANATIONS}
            placement="heading"
            pending={pending}
            onChangeStatus={onChangeStatus}
          />
        )}
      </div>

      <div>
        <div style={editorActionsRowStyle}>
          <Button type="submit" pending={pending}>
            Сохранить
          </Button>
        </div>
        {showDraftSafetyNote && <p style={noteStyle}>{DRAFT_SAFETY_NOTE}</p>}
      </div>
    </>
  );
}
