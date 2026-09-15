// Приглушённая группа черновиков банка под списком опубликованных кандидатов
// (ExamItemPicker.tsx) — вынесена отдельным файлом ради храповика размера
// файла (CLAUDE.md «Храповики»). Баг с прода: учитель завёл вопрос на
// «Вопросах» и не нашёл его в конструкторе экзамена — новый вопрос всегда
// черновик (ExamItemRecord, exam-item.schema.ts), а форма берёт только
// опубликованные. Теперь черновик виден здесь же, подписан, что в форму не
// попадёт, и публикуется одной кнопкой — учитель не уходит с экрана
// конструктора на «Вопросы» и обратно.
import type { CSSProperties } from 'react';
import type { ExamItemDto } from '@xuanxue/shared';
import { Button } from '../components/Button';
import {
  listCardMetaStyle,
  listCardStyle,
  listCardTitleStyle,
} from '../components/listCardStyles';
import { EXAM_ITEM_KIND_LABELS_RU } from '../exam-items/examItemLabels';

const DRAFTS_HEADING = 'Черновики — в форму не попадут, пока вы их не опубликуете.';

const headingStyle: CSSProperties = {
  margin: '14px 0 0',
  fontSize: 13,
  color: 'var(--ink-soft)',
};
const listStyle: CSSProperties = {
  margin: '8px 0 0',
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};
const rowStyle: CSSProperties = {
  ...listCardStyle,
  display: 'flex',
  gap: 8,
  cursor: 'default',
  opacity: 0.65,
};

interface ExamItemPickerDraftsProps {
  drafts: ExamItemDto[];
  onPublish: (itemId: string) => void;
}

export function ExamItemPickerDrafts({ drafts, onPublish }: ExamItemPickerDraftsProps) {
  if (drafts.length === 0) return null;

  return (
    <>
      <p style={headingStyle}>{DRAFTS_HEADING}</p>
      <ul style={listStyle}>
        {drafts.map((item) => (
          <li key={item.id} style={rowStyle}>
            <div style={{ flex: 1 }}>
              <div style={listCardTitleStyle}>{item.prompt}</div>
              <div style={listCardMetaStyle}>
                {EXAM_ITEM_KIND_LABELS_RU[item.kind]}
                {item.tags.length > 0 && ` · ${item.tags.join(', ')}`}
              </div>
            </div>
            <Button type="button" variant="secondary" onClick={() => onPublish(item.id)}>
              Опубликовать
            </Button>
          </li>
        ))}
      </ul>
    </>
  );
}
