// Объявление ученикам на доске штата (ADR-0172, дополнение 2026-10-07):
// учитель видит его там же, где ученик, и там же правит. До этого поле жило
// в разделе «Доска» экрана «Шаблоны» — три нажатия и прокрутка от доски,
// владелец его не нашёл («как это найти? на самой доске должен быть плюсик»).
// Три состояния (boardNoticeState.ts): нет — карточка-плюс «Добавить
// объявление»; висит — та же плашка, что у ученика, и «Изменить»; истекло —
// строка с текстом и датой, чтобы продлить или заменить, не набирая заново.
// Форма — BoardNoticeDialog.tsx поверх настроек школы (useSettings в
// StaffBoard.tsx): ответ PATCH сразу перерисовывает секцию (ADR-0087).
import { useState, type CSSProperties } from 'react';
import type { SettingsDto, UpdateSettingsInput } from '@xuanxue/shared';
import { AddCard } from '../components/AddCard';
import { TextLinkButton } from '../components/TextLinkButton';
import { BoardNoticeCard } from './BoardNoticeCard';
import { BoardNoticeDialog } from './BoardNoticeDialog';
import { boardNoticeState } from './boardNoticeState';
import { boardNoticeUntilText } from './boardNoticeUntil';

const ADD_TITLE = 'Добавить объявление';
const ADD_HINT =
  'Одна строка на **доске каждого ученика**: срок оплаты, ретрит, перенос занятий.';
const EDIT_LABEL = 'Изменить объявление';
// «До 20 октября» → «было до 20 октября»: та же дата, что видел ученик.
const EXPIRED_PREFIX = 'Объявление снято:';

const expiredStyle: CSSProperties = { margin: 0, color: 'var(--ink-soft)' };
const blockStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 };

interface StaffBoardNoticeProps {
  settings: SettingsDto;
  update: (input: UpdateSettingsInput) => Promise<void>;
  now: Date;
}

export function StaffBoardNotice({ settings, update, now }: StaffBoardNoticeProps) {
  const [editing, setEditing] = useState(false);
  const state = boardNoticeState(settings, now);

  return (
    <div style={blockStyle}>
      {state.kind === 'none' && (
        <AddCard title={ADD_TITLE} hint={ADD_HINT} onClick={() => setEditing(true)} />
      )}
      {state.kind === 'active' && <BoardNoticeCard notice={state.notice} />}
      {state.kind === 'expired' && (
        <p style={expiredStyle}>
          {EXPIRED_PREFIX} «{state.notice.text}»,{' '}
          {boardNoticeUntilText(state.notice.until)}
        </p>
      )}
      {state.kind !== 'none' && (
        <TextLinkButton onClick={() => setEditing(true)}>{EDIT_LABEL}</TextLinkButton>
      )}
      {editing && (
        <BoardNoticeDialog
          settings={settings}
          update={update}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}
