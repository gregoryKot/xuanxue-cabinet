// Действия строки «Люди» — удаление данных. Вынесены из PersonRow.tsx
// (check-file-size-ratchet: строка обзавелась подписью статуса и группой
// ролей, файл упёрся в свой потолок).
//
// Облик — ADR-0031: «Удалить данные» — текстом цвета опасности без заливки и
// рамки, как удаление в components/EditorFooter.tsx. У своей строки действий
// нет: свой аккаунт не удаляют из интерфейса (SELF_DELETE_MESSAGE,
// user-deletion.service.ts).
import type { CSSProperties } from 'react';
import { Button } from '../components/Button';

const REMOVE_LABEL = 'Удалить данные';

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 24,
  flexWrap: 'wrap',
};
const removeStyle: CSSProperties = { padding: 0 };

interface PersonActionsProps {
  isSelf: boolean;
  pending: boolean;
  onRemove: () => void;
}

export function PersonActions({ isSelf, pending, onRemove }: PersonActionsProps) {
  if (isSelf) return null;
  return (
    <div style={rowStyle}>
      <Button
        type="button"
        variant="danger"
        style={removeStyle}
        disabled={pending}
        onClick={onRemove}
      >
        {REMOVE_LABEL}
      </Button>
    </div>
  );
}
