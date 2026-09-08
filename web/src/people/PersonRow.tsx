// Строка списка «Люди» — имя, дата входа, два переключателя роли (CLAUDE.md
// «Одна механика — один компонент», образец — ChannelCard.tsx). Не карточка
// с клиентом: строка сама не открывается никуда, действие — сразу
// переключатель, без листа (мутация целиком в PATCH /users/:id).
import { useState, type CSSProperties } from 'react';
import type { UserDto, UserRole } from '@xuanxue/shared';
import { ApiError } from '../api/http';
import {
  listCardMetaStyle,
  listCardStyle,
  listCardTitleStyle,
} from '../components/listCardStyles';
import { Toggle } from '../components/Toggle';
import { formatDateTime } from '../lib/formatDate';

const TOGGLE_ERROR_MESSAGE = 'Не удалось изменить роль. Попробуйте ещё раз.';
// VOICE.md: подсказка объясняет запрет, не просто «нельзя» (текст ошибки
// сервиса — SELF_DEMOTE_MESSAGE в shared/src/users.ts, здесь короче: строка
// подсказки под выключенным переключателем, не место для полного текста).
const SELF_ADMIN_HINT = 'Роль администратора у себя снимает другой администратор';
const NEVER_LOGGED_IN = 'Ещё не входил';
// status === 'blocked': роль назначать можно и дальше, но AuthGuard отсекает
// вход раньше — подпись рядом с датой входа объясняет, почему переключатели
// не откроют человеку кабинет прямо сейчас.
const ACCESS_BLOCKED_LABEL = 'Доступ закрыт';

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
   * переключатель admin выключен, снять роль у себя нельзя из интерфейса. */
  isSelf: boolean;
  onChangeRoles: (roles: UserRole[]) => Promise<void>;
}

export function PersonRow({ person, isSelf, onChangeRoles }: PersonRowProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(role: UserRole, checked: boolean) {
    setPending(true);
    setError(null);
    const nextRoles = checked
      ? [...person.roles, role]
      : person.roles.filter((r) => r !== role);
    try {
      await onChangeRoles(nextRoles);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : TOGGLE_ERROR_MESSAGE);
    } finally {
      setPending(false);
    }
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
          onChange={(checked) => void toggle('teacher', checked)}
        />
        <Toggle
          label={`Администратор — ${person.name}`}
          checked={person.roles.includes('admin')}
          disabled={pending || isSelf}
          onChange={(checked) => void toggle('admin', checked)}
        />
      </div>

      {isSelf && <p style={hintStyle}>{SELF_ADMIN_HINT}</p>}
      {error && (
        <p style={alertTextStyle} role="alert">
          {error}
        </p>
      )}
    </li>
  );
}
