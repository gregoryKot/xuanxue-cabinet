// Добавление вопроса в блок — список опубликованных вопросов банка с
// фильтром по тегу (ТЗ 4.3, «Лист»): уже добавленный в форму вопрос виден как
// добавленный и второй раз не добавляется (сервер это тоже запрещает, экран
// не должен доводить до ошибки). Под списком — черновики банка того же
// фильтра (ExamItemPickerDrafts.tsx): баг с прода, учитель завёл вопрос и не
// нашёл его здесь, потому что новый вопрос всегда черновик, а форма берёт
// только опубликованные — теперь черновик виден и публикуется отсюда же.
import { useState, type CSSProperties } from 'react';
import type { ExamItemDto } from '@xuanxue/shared';
import { Field, inputStyle } from '../components/Field';
import {
  listCardMetaStyle,
  listCardStyle,
  listCardTitleStyle,
} from '../components/listCardStyles';
import { Button } from '../components/Button';
import { EXAM_ITEM_KIND_LABELS_RU } from '../exam-items/examItemLabels';
import { ExamItemPickerDrafts } from './ExamItemPickerDrafts';
import { formatNoPublishedMessage } from './examItemPickerEmptyMessage';
import { filterPickerCandidates, filterPickerDrafts } from './examItemPickerFilter';

// Банк ещё грузится (медленная сеть, «холодный старт» сервиса) — тот же
// текст, что у предпросмотра формы (ExamPreview.tsx): пока ответ не пришёл,
// список пуст независимо от того, есть ли вопросы на самом деле, и это не
// повод заявлять «опубликованных вопросов нет» (баг с прода: учитель
// опубликовал вопрос и не нашёл его в конструкторе — тот успел показать
// это сообщение до ответа сервера, CLAUDE.md «Загрузка»).
const LOADING_MESSAGE = 'Загружаем вопросы…';

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
const emptyMessageStyle: CSSProperties = {
  margin: '8px 0 0',
  fontSize: 13,
  color: 'var(--ink-soft)',
};

interface ExamItemPickerProps {
  bankItems: ExamItemDto[];
  bankLoading: boolean;
  usedItemIds: ReadonlySet<string>;
  onAdd: (itemId: string) => void;
  onPublish: (itemId: string) => void;
}

export function ExamItemPicker({
  bankItems,
  bankLoading,
  usedItemIds,
  onAdd,
  onPublish,
}: ExamItemPickerProps) {
  const [tag, setTag] = useState('');
  const candidates = filterPickerCandidates(bankItems, tag);
  const drafts = filterPickerDrafts(bankItems, tag);
  const hasAnyPublished = bankItems.some((item) => item.status === 'published');
  const draftsTotal = bankItems.filter((item) => item.status === 'draft').length;

  return (
    <div>
      <Field label="Фильтр по тегу">
        <input style={inputStyle} value={tag} onChange={(e) => setTag(e.target.value)} />
      </Field>

      {bankLoading ? (
        <p style={emptyMessageStyle}>{LOADING_MESSAGE}</p>
      ) : (
        candidates.length === 0 && (
          <p style={emptyMessageStyle}>
            {formatNoPublishedMessage(hasAnyPublished, draftsTotal)}
          </p>
        )
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

      {!bankLoading && <ExamItemPickerDrafts drafts={drafts} onPublish={onPublish} />}
    </div>
  );
}
