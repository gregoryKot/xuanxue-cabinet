// Переключатели ролей строки «Люди» — по одному на каждую роль из
// USER_ROLES, плюс подсказки, что означает их состояние. Вынесены из
// PersonRow.tsx (check-file-size-ratchet: файл уже был на границе 150 строк,
// «Подтвердить» на invited добавил бы файлу расти).
//
// Подпись переключателя — только название роли: раньше каждая читалась
// «Администратор — Игорь Семёнов», и на 360 px строка человека превращалась
// в четыре широкие строки с его именем (ADR-0031, облик списка). Имя
// осталось в `<legend>` для скринридера: `<fieldset>` даёт группе доступное
// имя, и «Учитель» внутри неё звучит как «Учитель, группа Игорь Семёнов» —
// без ARIA и без видимого повтора (CLAUDE.md «Доступность»).
import type { CSSProperties } from 'react';
import { ROLE_LABELS, USER_ROLES, type UserDto, type UserRole } from '@xuanxue/shared';
import { Toggle } from '../components/Toggle';

// Тумблера «Ученик» нет: ученик — это подтверждённый человек без ролей
// учителя (ADR-0026), отдельной роли для него нет в USER_ROLES — переключать
// нечего.
// VOICE.md: подсказка объясняет запрет, не просто «нельзя» (текст ошибки
// сервиса — SELF_DEMOTE_MESSAGE в shared/src/users.ts, здесь короче: строка
// подсказки под выключенным переключателем, не место для полного текста).
const SELF_ADMIN_HINT = 'Роль администратора у себя снимает другой администратор';
// VOICE.md: без общих слов — что именно значит пустой набор ролей, видно
// только тем, у кого он сейчас пуст.
const NO_ROLE_HINT =
  'Без роли выше человек — ученик, отдельного переключателя для этого нет';

// `border`/`padding`/`margin` в ноль: у <fieldset> своя браузерная рамка, а
// рамок в списке нет (ADR-0031). `columnGap` без `rowGap`: на 360 px
// переключатели переносятся на вторую строку и встают парами, не столбиком.
const fieldsetStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  columnGap: 20,
  border: 0,
  margin: 0,
  padding: 0,
  minWidth: 0,
};
const hintStyle: CSSProperties = { margin: 0, fontSize: 12, color: 'var(--ink-soft)' };

interface PersonRolesProps {
  person: UserDto;
  /** Строка — сам виден пользователь себе в списке (SECURITY §2): его
   * переключатель admin выключен. */
  isSelf: boolean;
  pending: boolean;
  onToggle: (role: UserRole, checked: boolean) => void;
}

export function PersonRoles({ person, isSelf, pending, onToggle }: PersonRolesProps) {
  return (
    <>
      <fieldset style={fieldsetStyle}>
        <legend className="xuanxue-sr-only">Роли — {person.name}</legend>
        {USER_ROLES.map((role) => (
          <Toggle
            key={role}
            label={ROLE_LABELS[role]}
            checked={person.roles.includes(role)}
            // Снять admin у себя нельзя из интерфейса (SELF_ADMIN_HINT ниже) —
            // остальные роли у своей же строки переключаются свободно.
            disabled={pending || (role === 'admin' && isSelf)}
            onChange={(checked) => onToggle(role, checked)}
          />
        ))}
      </fieldset>
      {isSelf && <p style={hintStyle}>{SELF_ADMIN_HINT}</p>}
      {!USER_ROLES.some((role) => person.roles.includes(role)) && (
        <p style={hintStyle}>{NO_ROLE_HINT}</p>
      )}
    </>
  );
}
