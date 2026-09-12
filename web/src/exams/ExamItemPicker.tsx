// Добавление вопроса в блок — список опубликованных вопросов банка с
// фильтром по тегу (ТЗ 4.3, «Лист»): уже добавленный в форму вопрос виден как
// добавленный и второй раз не добавляется (сервер это тоже запрещает, экран
// не должен доводить до ошибки).
import { useState, type CSSProperties } from 'react';
import type { ExamItemDto } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { Field, inputStyle } from '../components/Field';
import {
  listCardMetaStyle,
  listCardStyle,
  listCardTitleStyle,
} from '../components/listCardStyles';
import { EXAM_ITEM_KIND_LABELS_RU } from '../exam-items/examItemLabels';
import { filterPickerCandidates } from './examItemPickerFilter';

const NO_PUBLISHED_MESSAGE =
  'Опубликованных вопросов пока нет. Добавьте и опубликуйте их на «Вопросах для экзамена».';
const NO_MATCH_MESSAGE = 'По этому тегу опубликованных вопросов нет.';

const listStyle: CSSProperties = {
  margin: 0,
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
};

interface ExamItemPickerProps {
  bankItems: ExamItemDto[];
  usedItemIds: ReadonlySet<string>;
  onAdd: (itemId: string) => void;
}

export function ExamItemPicker({ bankItems, usedItemIds, onAdd }: ExamItemPickerProps) {
  const [tag, setTag] = useState('');
  const candidates = filterPickerCandidates(bankItems, tag);
  const hasAnyPublished = bankItems.some((item) => item.status === 'published');

  return (
    <div>
      <Field label="Фильтр по тегу">
        <input style={inputStyle} value={tag} onChange={(e) => setTag(e.target.value)} />
      </Field>

      {candidates.length === 0 && (
        <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--ink-soft)' }}>
          {hasAnyPublished ? NO_MATCH_MESSAGE : NO_PUBLISHED_MESSAGE}
        </p>
      )}

      <ul style={{ ...listStyle, marginTop: 8 }}>
        {candidates.map((item) => {
          const added = usedItemIds.has(item.id);
          return (
            <li key={item.id} style={rowStyle}>
              <div style={{ flex: 1 }}>
                <div style={listCardTitleStyle}>{item.prompt}</div>
                <div style={listCardMetaStyle}>
                  {EXAM_ITEM_KIND_LABELS_RU[item.kind]}
                  {item.tags.length > 0 && ` · ${item.tags.join(', ')}`}
                </div>
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={added}
                onClick={() => onAdd(item.id)}
              >
                {added ? 'Добавлено' : 'Добавить'}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
