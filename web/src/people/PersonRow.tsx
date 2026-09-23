// Строка списка «Люди» — по макету 2c-people.html (docs/adr/0043): имя и
// контакт слева (PersonIdentity.tsx), пилюли ролей справа — они же их и
// переключают (PersonRoleBadge.tsx). Список теперь одна карточка (обёртка —
// PeopleScreen.tsx, `--radius-block`, `overflow: hidden`), поэтому строка не
// несёт свой фон и тень — только паддинг и волосяная линия снизу, тот же
// приём, что у ExamCard.tsx/BroadcastCard.tsx.
//
// «Закрыть доступ»/«Открыть доступ» и «Удалить данные» макет не рисует ни на
// одной из четырёх строк примера — но это работающие, покрытые тестами
// возможности экрана, отказаться от них без замены нельзя (границы этой
// правки), поэтому они остаются второй, тише набранной строкой под контактом
// (PersonActions.tsx, без изменений: точки входа те же, что во всей задаче
// нельзя трогать — назначение ролей, удаление данных, права).
import { useState, type CSSProperties } from 'react';
import type { UserDto, UserRole, UserStatus } from '@xuanxue/shared';
import { ApiError } from '../api/http';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { dangerNoteStyle } from '../components/screenLayout';
import { PersonActions } from './PersonActions';
import { PersonIdentity } from './PersonIdentity';
import { PersonRoleBadge } from './PersonRoleBadge';

const TOGGLE_ERROR_MESSAGE = 'Не удалось изменить роль. Попробуйте ещё раз.';
const ACCESS_ERROR_MESSAGE = 'Не удалось изменить доступ. Попробуйте ещё раз.';
const REMOVE_ERROR_MESSAGE = 'Не удалось удалить данные. Попробуйте ещё раз.';
const REMOVE_CONFIRM_TITLE = 'Удалить данные?';
// VOICE.md: конкретика — что именно пропадёт, не «данные удалятся».
const REMOVE_CONFIRM_MESSAGE =
  'Аккаунт и вход в кабинет пропадут. В занятиях, классах, каналах и рассылках, где он стоит ведущим или автором, это поле **опустеет**. **Отменить нельзя**.';

const rowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: '14px 20px',
};
const topLineStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  flexWrap: 'wrap',
};

interface PersonRowProps {
  person: UserDto;
  /** Строка — сам виден пользователь себе в списке (SECURITY §2): действия
   * роли и PersonActions у своей строки не показываются (свой аккаунт не
   * меняют из интерфейса, SELF_DELETE_MESSAGE/SELF_BLOCK_MESSAGE). */
  isSelf: boolean;
  onChangeRoles: (roles: UserRole[]) => Promise<void>;
  onChangeStatus: (status: UserStatus) => Promise<void>;
  onRemove: () => Promise<void>;
  /** Последняя строка общей карточки списка — без нижней волосяной линии
   * (PeopleScreen.tsx, docs/adr/0043), тот же приём, что у ExamCard.tsx. */
  isLast?: boolean;
}

export function PersonRow({
  person,
  isSelf,
  onChangeRoles,
  onChangeStatus,
  onRemove,
  isLast = false,
}: PersonRowProps) {
  // Один pending/error на всю строку — переключатель роли, доступ и удаление
  // не идут одновременно, всем хватает общего run() ниже.
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

  // Роль добавляется к уже имеющимся, а не заменяет их: человек бывает и
  // учителем, и администратором разом (макет 2c рисует у владельца обе пилюли).
  function toggleRole(role: UserRole, checked: boolean) {
    const nextRoles = checked
      ? [...person.roles, role]
      : person.roles.filter((current) => current !== role);
    void run(() => onChangeRoles(nextRoles), TOGGLE_ERROR_MESSAGE);
  }

  return (
    <li style={{ ...rowStyle, borderBottom: isLast ? 'none' : '1px solid var(--panel)' }}>
      <div style={topLineStyle}>
        <PersonIdentity person={person} isSelf={isSelf} />

        <PersonRoleBadge
          person={person}
          isSelf={isSelf}
          pending={pending}
          onToggleRole={toggleRole}
        />
      </div>

      <PersonActions
        isSelf={isSelf}
        pending={pending}
        status={person.status}
        onToggleAccess={() =>
          void run(
            () => onChangeStatus(person.status === 'blocked' ? 'active' : 'blocked'),
            ACCESS_ERROR_MESSAGE,
          )
        }
        onRemove={() => setConfirmingRemove(true)}
      />

      {error && (
        <p style={dangerNoteStyle} role="alert">
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
