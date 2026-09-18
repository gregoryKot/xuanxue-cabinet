// Роли строки «Люди» — пилюля на каждую роль из USER_ROLES, и пилюля же её
// переключает (макет 2c-people.html, docs/adr/0043).
//
// Макет рисует пилюли только у ролей, которые уже есть, и одно действие
// «Сделать учителем»/«Снять роль». Буквально это значило бы, что admin,
// assistant и accountant с экрана больше не выдать — а экран заведён ровно
// ради этого (блокер аудита Б3: до него admin назначали правкой Atlas руками),
// и CLAUDE.md «Кабинет учителя» проверяет вопросом «чтобы это поменять, Диме
// нужен разработчик?». Поэтому пилюля здесь не статус, а переключатель:
// вид из макета, возможности прежнего PersonRoles.tsx (заменён этим файлом).
//
// Нажатая пилюля — заливка подложкой, ненажатая — только контур: роль видно
// не одним цветом, а формой (низкое зрение, ч/б печать), тот же принцип, что
// у трёх силуэтов Button.tsx. `aria-pressed` говорит состояние вслух, а
// <fieldset> с невидимой <legend> даёт группе имя — иначе скринридер читает
// «Учитель» без ответа на вопрос «чей».
import type { CSSProperties } from 'react';
import { ROLE_LABELS, USER_ROLES, type UserDto, type UserRole } from '@xuanxue/shared';

// VOICE.md: подсказка объясняет запрет, не просто «нельзя» (полный текст
// ошибки сервиса — SELF_DEMOTE_MESSAGE в shared/src/users.ts).
const SELF_ADMIN_HINT = 'Роль администратора у себя снимает другой администратор';
// VOICE.md: без общих слов — что значит пустой набор ролей, видно только
// тому, у кого он сейчас пуст.
const NO_ROLE_HINT =
  'Без роли выше человек — ученик, отдельного переключателя для этого нет';

// Порядок пилюль — не порядок USER_ROLES: тот собран для валидации и API.
// teacher первым, потому что это самая частая роль (PLAN.md §3: учителей
// несколько с первого дня, админ обычно один).
const PILL_ORDER: readonly UserRole[] = ['teacher', 'admin', 'assistant', 'accountant'];

// `border`/`padding`/`margin` в ноль: у <fieldset> своя браузерная рамка, а
// рамок в строке списка нет.
const fieldsetStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  flexWrap: 'wrap',
  gap: 8,
  border: 0,
  margin: 0,
  padding: 0,
  minWidth: 0,
};

// Макет даёт пилюле ~26px по высоте — ниже цели нажатия 44px. Здесь пилюля
// нажимается, поэтому 44px обязательны (CLAUDE.md «Доступность», отклонение
// от макета зафиксировано в ADR-0043). Высоту держит minHeight, а не padding:
// пилюля остаётся визуально той же, цель нажатия вырастает вокруг неё.
const pillBaseStyle: CSSProperties = {
  padding: '5px 12px',
  minHeight: 44,
  display: 'inline-flex',
  alignItems: 'center',
  borderRadius: 'var(--radius-pill)',
  font: 'inherit',
  fontSize: 12,
  cursor: 'pointer',
};

const pillOnStyle: CSSProperties = {
  ...pillBaseStyle,
  border: '1px solid transparent',
  background: 'var(--panel)',
  color: 'var(--ink)',
};

const pillOffStyle: CSSProperties = {
  ...pillBaseStyle,
  border: '1px solid var(--control-border)',
  background: 'transparent',
  color: 'var(--ink-soft)',
};

const hintStyle: CSSProperties = { margin: 0, fontSize: 12, color: 'var(--ink-soft)' };

interface PersonRoleBadgeProps {
  person: UserDto;
  /** Своя строка: снять admin у себя из интерфейса нельзя (SECURITY §2),
   * остальные роли у своей же строки переключаются свободно. */
  isSelf: boolean;
  pending: boolean;
  onToggleRole: (role: UserRole, checked: boolean) => void;
}

export function PersonRoleBadge({
  person,
  isSelf,
  pending,
  onToggleRole,
}: PersonRoleBadgeProps) {
  const hasNoRole = !USER_ROLES.some((role) => person.roles.includes(role));
  return (
    <>
      <fieldset style={fieldsetStyle} disabled={pending}>
        <legend className="xuanxue-sr-only">Роли — {person.name}</legend>
        {PILL_ORDER.map((role) => {
          const checked = person.roles.includes(role);
          return (
            <button
              key={role}
              type="button"
              aria-pressed={checked}
              disabled={pending || (role === 'admin' && isSelf)}
              style={checked ? pillOnStyle : pillOffStyle}
              onClick={() => onToggleRole(role, !checked)}
            >
              {ROLE_LABELS[role]}
            </button>
          );
        })}
      </fieldset>
      {isSelf && <p style={hintStyle}>{SELF_ADMIN_HINT}</p>}
      {hasNoRole && <p style={hintStyle}>{NO_ROLE_HINT}</p>}
    </>
  );
}
