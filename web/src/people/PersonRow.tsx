// Строка списка «Люди» — имя, дата входа, два переключателя роли, удаление
// данных (CLAUDE.md «Одна механика — один компонент», образец —
// ChannelCard.tsx). Не карточка с клиентом: строка сама не открывается
// никуда, переключатель роли — сразу мутация (PATCH /users/:id), удаление —
// через общий ConfirmDialog (образец — ChannelSheet.tsx), необратимо и
// поэтому с подтверждением.
import { useState, type CSSProperties } from 'react';
import type { UserDto, UserRole } from '@xuanxue/shared';
import { ApiError } from '../api/http';
import { ConfirmDialog } from '../components/ConfirmDialog';
import {
  listCardMetaStyle,
  listCardStyle,
  listCardTitleStyle,
} from '../components/listCardStyles';
import { Button } from '../components/Button';
import { Toggle } from '../components/Toggle';
import { formatDateTime } from '../lib/formatDate';

const TOGGLE_ERROR_MESSAGE = 'Не удалось изменить роль. Попробуйте ещё раз.';
const REMOVE_ERROR_MESSAGE = 'Не удалось удалить данные. Попробуйте ещё раз.';
// VOICE.md: подсказка объясняет запрет, не просто «нельзя» (текст ошибки
// сервиса — SELF_DEMOTE_MESSAGE в shared/src/users.ts, здесь короче: строка
// подсказки под выключенным переключателем, не место для полного текста).
const SELF_ADMIN_HINT = 'Роль администратора у себя снимает другой администратор';
const NEVER_LOGGED_IN = 'Ещё не входил';
// status === 'blocked': роль назначать можно и дальше, но AuthGuard отсекает
// вход раньше — подпись рядом с датой входа объясняет, почему переключатели
// не откроют человеку кабинет прямо сейчас.
const ACCESS_BLOCKED_LABEL = 'Доступ закрыт';
const REMOVE_CONFIRM_TITLE = 'Удалить данные?';
// VOICE.md: конкретика — что именно пропадёт, не «данные удалятся».
const REMOVE_CONFIRM_MESSAGE =
  'Аккаунт и вход в кабинет пропадут. В занятиях, классах, каналах и рассылках, где он стоит ведущим или автором, это поле опустеет. Отменить нельзя.';

const rowStyle: CSSProperties = {
  ...listCardStyle,
  cursor: 'default',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};
const actionsRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
};
const hintStyle: CSSProperties = { margin: 0, fontSize: 12, color: 'var(--ink-soft)' };
const alertTextStyle: CSSProperties = { margin: 0, fontSize: 13, color: 'var(--danger)' };

interface PersonRowProps {
  person: UserDto;
  /** Строка — сам виден пользователь себе в списке (SECURITY §2): его
   * переключатель admin выключен, снять роль у себя нельзя из интерфейса,
   * кнопки «Удалить данные» тоже нет — свой аккаунт удалить нельзя
   * (SELF_DELETE_MESSAGE, api/src/users/user-deletion.service.ts). */
  isSelf: boolean;
  onChangeRoles: (roles: UserRole[]) => Promise<void>;
  onRemove: () => Promise<void>;
}

export function PersonRow({ person, isSelf, onChangeRoles, onRemove }: PersonRowProps) {
  // Один pending/error на всю строку — переключатель роли и удаление не
  // идут одновременно, обоим хватает общего run() ниже.
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

  return (
    <li style={rowStyle}>
      <div>
        <div style={listCardTitleStyle}>{person.name}</div>
        <div style={listCardMetaStyle}>
          {person.lastLoginAt
            ? `Вход ${formatDateTime(person.lastLoginAt)}`
            : NEVER_LOGGED_IN}
          {person.status === 'blocked' && ` · ${ACCESS_BLOCKED_LABEL}`}
        </div>
      </div>

      <div style={actionsRowStyle}>
        <Toggle
          label={`Учитель — ${person.name}`}
          checked={person.roles.includes('teacher')}
          disabled={pending}
          onChange={(checked) => toggle('teacher', checked)}
        />
        <Toggle
          label={`Администратор — ${person.name}`}
          checked={person.roles.includes('admin')}
          disabled={pending || isSelf}
          onChange={(checked) => toggle('admin', checked)}
        />
        {!isSelf && (
          <Button
            type="button"
            variant="danger"
            disabled={pending}
            onClick={() => setConfirmingRemove(true)}
          >
            Удалить данные
          </Button>
        )}
      </div>

      {isSelf && <p style={hintStyle}>{SELF_ADMIN_HINT}</p>}
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
