// Строка списка «Люди» — имя, служебная строка входа и статуса,
// переключатели ролей (PersonRoles.tsx, CLAUDE.md «Одна механика — один
// компонент»), подтверждение и удаление. Не карточка с клиентом: строка сама
// не открывается никуда, переключатель роли — сразу мутация (PATCH
// /users/:id), подтверждение — POST /users/:id/approve (ADR-0026), удаление —
// через общий ConfirmDialog (образец — hooks/useConfirmedRemove.ts), необратимо и
// поэтому с подтверждением.
//
// Облик — ADR-0031: имя антиквой, статус растяжкой-заглавными, действия —
// PersonActions.tsx.
import { useState, type CSSProperties } from 'react';
import type { UserDto, UserRole } from '@xuanxue/shared';
import { ApiError } from '../api/http';
import { ConfirmDialog } from '../components/ConfirmDialog';
import {
  listCardMetaStyle,
  listCardStyle,
  listCardTitleStyle,
} from '../components/listCardStyles';
import { formatDateTime } from '../lib/formatDate';
import { PersonActions } from './PersonActions';
import { PersonRoles } from './PersonRoles';

const TOGGLE_ERROR_MESSAGE = 'Не удалось изменить роль. Попробуйте ещё раз.';
const REMOVE_ERROR_MESSAGE = 'Не удалось удалить данные. Попробуйте ещё раз.';
const APPROVE_ERROR_MESSAGE = 'Не удалось подтвердить. Попробуйте ещё раз.';
const NEVER_LOGGED_IN = 'Ещё не входил';
// Подпись статуса рядом с датой входа — растяжкой-заглавными (ADR-0031):
// blocked — переключатели роли не откроют кабинет, вход отсекает AuthGuard;
// invited — школа ещё не подтвердила первый вход (ADR-0026), поэтому у
// строки есть «Подтвердить». У активного подписи нет: это обычное состояние.
const STATUS_LABELS: Partial<Record<UserDto['status'], string>> = {
  blocked: 'Доступ закрыт',
  invited: 'Ждёт подтверждения',
};
const REMOVE_CONFIRM_TITLE = 'Удалить данные?';
// VOICE.md: конкретика — что именно пропадёт, не «данные удалятся».
const REMOVE_CONFIRM_MESSAGE =
  'Аккаунт и вход в кабинет пропадут. В занятиях, классах, каналах и рассылках, где он стоит ведущим или автором, это поле опустеет. Отменить нельзя.';

const rowStyle: CSSProperties = {
  ...listCardStyle,
  cursor: 'default',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};
const alertTextStyle: CSSProperties = { margin: 0, fontSize: 13, color: 'var(--danger)' };

interface PersonRowProps {
  person: UserDto;
  /** Строка — сам виден пользователь себе в списке (SECURITY §2): его
   * переключатель admin выключен, снять роль у себя нельзя из интерфейса,
   * кнопок «Подтвердить» и «Удалить данные» тоже нет — свой аккаунт не
   * подтверждают и не удаляют из интерфейса (SELF_DELETE_MESSAGE,
   * api/src/users/user-deletion.service.ts). */
  isSelf: boolean;
  onChangeRoles: (roles: UserRole[]) => Promise<void>;
  onApprove: () => Promise<void>;
  onRemove: () => Promise<void>;
}

export function PersonRow({
  person,
  isSelf,
  onChangeRoles,
  onApprove,
  onRemove,
}: PersonRowProps) {
  // Один pending/error на всю строку — переключатель роли, подтверждение и
  // удаление не идут одновременно, всем хватает общего run() ниже.
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  async function run(action: () => Promise<void>, fallback: string) {
    setPending(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fallback);
    } finally {
      setPending(false);
    }
  }

  function toggle(role: UserRole, checked: boolean) {
    const nextRoles = checked
      ? [...person.roles, role]
      : person.roles.filter((r) => r !== role);
    void run(() => onChangeRoles(nextRoles), TOGGLE_ERROR_MESSAGE);
  }

  const statusLabel = STATUS_LABELS[person.status];

  return (
    <li style={rowStyle}>
      <div>
        <div style={listCardTitleStyle}>{person.name}</div>
        <div style={listCardMetaStyle}>
          {person.lastLoginAt
            ? `Вход ${formatDateTime(person.lastLoginAt)}`
            : NEVER_LOGGED_IN}
          {statusLabel && (
            <>
              {' · '}
              <span className="xuanxue-status-label">{statusLabel}</span>
            </>
          )}
        </div>
      </div>

      <PersonRoles person={person} isSelf={isSelf} pending={pending} onToggle={toggle} />

      <PersonActions
        isSelf={isSelf}
        isInvited={person.status === 'invited'}
        pending={pending}
        onApprove={() => void run(onApprove, APPROVE_ERROR_MESSAGE)}
        onRemove={() => setConfirmingRemove(true)}
      />

      {error && (
        <p style={alertTextStyle} role="alert">
          {error}
        </p>
      )}

      {confirmingRemove && (
        <ConfirmDialog
          title={REMOVE_CONFIRM_TITLE}
          message={REMOVE_CONFIRM_MESSAGE}
          confirmLabel="Удалить данные"
          pending={pending}
          onConfirm={() => run(onRemove, REMOVE_ERROR_MESSAGE)}
          onCancel={() => setConfirmingRemove(false)}
        />
      )}
    </li>
  );
}
