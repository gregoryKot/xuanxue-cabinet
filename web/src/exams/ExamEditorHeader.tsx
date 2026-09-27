// Верх страницы редактора экзамена (ExamEditorForm.tsx, ADR-0139): полоса
// «назад — Удалить экзамен — Сохранить», прилипающая к верху, под ней
// заголовок со строкой статуса («Опубликовать» / «В архив») и заметкой про
// несохранённые правки. Вынесено в отдельный файл ровно из-за
// храповика размера (CLAUDE.md «Храповики», 150 строк) — сама форма с этим
// блоком внутри выросла выше потолка.
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { ExamDto, ExamStatus } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { EditorStatusRow } from '../components/EditorStatusRow';
import { noteStyle, screenTitleStyle } from '../components/screenLayout';
import { TextLinkButton } from '../components/TextLinkButton';
import {
  backLinkStyle,
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
const DRAFT_SAFETY_NOTE = 'Не сохранено — набранное хранится на этом устройстве.';

// Верхняя полоса «назад — удалить — Сохранить» прилипает к верху при
// прокрутке (отзыв владельца 2026-09-27: «Сохранить» стояла отдельным рядом
// посреди страницы, «уродливо и непонятно где», а у длинного списка вопросов
// её снова приходилось искать). Приём тот же, что у таймера попытки
// (attempt/AttemptDeadlineTimer.tsx): полоса — прямой потомок формы-колонки,
// иначе sticky ограничен высотой родителя; фон страницы под собой, чтобы
// проскроленные поля не просвечивали.
const stickyBarStyle: CSSProperties = {
  ...editorTopRowStyle,
  position: 'sticky',
  top: 0,
  zIndex: 1,
  background: 'var(--paper)',
  padding: '8px 0',
  borderBottom: '1px solid var(--line)',
};
// В полосе ссылка встаёт по центру кнопки, а не по верху строки.
const barLinkStyle: CSSProperties = { ...backLinkStyle, alignSelf: 'center' };
const barActionsStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  marginLeft: 'auto',
};

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
      <div style={stickyBarStyle}>
        <Link to={EXAMS_PATH} style={barLinkStyle}>
          {BACK_TEXT}
        </Link>
        <div style={barActionsStyle}>
          {/* Удаление разрешено только черновику (ExamsService.remove). */}
          {exam && exam.status === 'draft' && (
            <TextLinkButton onClick={onRequestRemove} disabled={pending} danger>
              {REMOVE_LABEL}
            </TextLinkButton>
          )}
          <Button type="submit" pending={pending}>
            Сохранить
          </Button>
        </div>
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
        {showDraftSafetyNote && <p style={noteStyle}>{DRAFT_SAFETY_NOTE}</p>}
      </div>
    </>
  );
}
