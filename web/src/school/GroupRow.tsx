// Строка списка групп на экране «Школа» (ADR-0193): название и число занятий,
// «Переименовать» на месте и «Удалить» — только у группы без занятий (сервер
// всё равно откажет, но кнопка, которая заведомо не сработает, — это ловушка).
// Подпись у кнопок содержит название группы скрытым текстом: у скринридера в
// списке из трёх строк иначе три одинаковых «Переименовать».
import type { CSSProperties } from 'react';
import type { GroupDto } from '@xuanxue/shared';
import { Field, inputStyle } from '../components/Field';
import { FormServerError } from '../components/FormServerError';
import { InlineFormFooter } from '../components/InlineFormFooter';
import { listCardMetaStyle, listCardTitleStyle } from '../components/listCardStyles';
import { TextLinkButton } from '../components/TextLinkButton';
import { groupClassCountText } from './groupsText';
import { useGroupRow } from './useGroupRow';

const rowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: '14px 20px',
};
const lineStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: 12,
};
const actionsStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 16 };

interface GroupRowProps {
  group: GroupDto;
  isLast: boolean;
  onRename: (id: string, name: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}

export function GroupRow({ group, isLast, onRename, onRemove }: GroupRowProps) {
  const row = useGroupRow(group, { onRename, onRemove });
  const style = { ...rowStyle, borderBottom: isLast ? 'none' : '1px solid var(--panel)' };
  const canRemove = group.classCount === 0;

  if (row.editing) {
    return (
      <li style={style}>
        <Field label="Название группы">
          <input
            style={inputStyle}
            value={row.name}
            onChange={(event) => row.setName(event.target.value)}
          />
        </Field>
        <FormServerError error={row.error} />
        <InlineFormFooter
          saveLabel="Сохранить"
          pending={row.pending}
          onSave={() => void row.save()}
          onCancel={row.cancelEditing}
        />
      </li>
    );
  }

  return (
    <li style={style}>
      <div style={lineStyle}>
        <div>
          <div style={{ ...listCardTitleStyle, fontSize: 20 }}>{group.name}</div>
          <div style={listCardMetaStyle}>{groupClassCountText(group.classCount)}</div>
        </div>
        <div style={actionsStyle}>
          <TextLinkButton onClick={row.startEditing} disabled={row.pending}>
            Переименовать
            <span className="xuanxue-sr-only"> группу «{group.name}»</span>
          </TextLinkButton>
          {canRemove ? (
            <TextLinkButton
              danger
              onClick={() => void row.remove()}
              disabled={row.pending}
            >
              Удалить
              <span className="xuanxue-sr-only"> группу «{group.name}»</span>
            </TextLinkButton>
          ) : (
            <span style={listCardMetaStyle}>Удалить нельзя: есть занятия</span>
          )}
        </div>
      </div>
      <FormServerError error={row.error} />
    </li>
  );
}
