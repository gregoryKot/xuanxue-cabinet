// «Ученики» — те, кто хоть раз вошёл в кабинет через Telegram, и назначение
// ролей учитель/админ (docs/PLAN.md §6, блокер аудита Б3: до этого экрана
// вторую роль назначали правкой Atlas руками). Маршрут /people открыт admin
// и teacher (RequirePeopleAccess, ADR-0030 — ссылку-приглашение отдаёт и
// учитель), но список учеников, роли и удаление данных внутри экрана видит
// только admin (SECURITY §3) — teacher видит только ссылку-приглашение.
// Облик — направление «тихо и благородно» (docs/adr/0031), как «Занятия» и
// «Вопросы»: заголовок антиквой через ScreenHeader, люди — строками на
// волосяных линиях, киноварь одна на экран («Подтвердить» у тех, кто ждёт).
import type { CSSProperties } from 'react';
import type { UserDto } from '@xuanxue/shared';
import { useAuth } from '../auth/AuthProvider';
import { hasRole } from '../auth/hasRole';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { screenSectionStyle } from '../components/screenLayout';
import { ScreenHeader } from '../components/ScreenHeader';
import { SkeletonList } from '../components/Skeleton';
import { formatJoinedViaInviteCount } from './formatJoinedViaInviteCount';
import { InviteLinkCard } from './InviteLinkCard';
import { PersonRow } from './PersonRow';
import { usePeople } from './usePeople';

// Заголовок совпадает с пунктом навигации (app/navItems.ts): два имени у
// одного раздела сбивают с толку.
const TITLE = 'Ученики';
const EXPLANATION =
  'Здесь те, кто хотя бы раз вошёл в кабинет через Telegram. После первого входа человек ждёт вашего подтверждения — он стоит вверху списка.';
// Что дают роли — приписка под объяснением: читают её один раз, а место в
// шапке дорогое (ScreenHeader.hint, тот же приём, что пояс школы у «Занятий»).
const ROLES_HINT =
  'Отметьте, кто ведёт занятия: учитель видит расписание и рассылки, администратор ещё и назначает роли.';
const TEACHER_EXPLANATION =
  'Список учеников и назначение ролей видит только администратор — вам здесь доступна ссылка-приглашение школы.';
const EMPTY_MESSAGE =
  'Пока никто, кроме вас, не входил. Дайте ссылку на кабинет — после первого входа человек появится здесь.';

// Строки держатся на волосяной линии снизу (listCardStyle), поэтому зазора
// между ними нет: со щелью список рассыпается на карточки (ADR-0031).
const listStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
};
const countStyle: CSSProperties = { margin: 0, fontSize: 13, color: 'var(--ink-soft)' };

// Ждущие подтверждения — вверху: это то, что требует действия админа
// сейчас (ADR-0026). Sort стабилен (ES2019+), поэтому порядок остальных
// строк из ответа API не меняется.
const pendingFirst = (person: UserDto): number => (person.status === 'invited' ? 0 : 1);

export default function PeopleScreen() {
  const { me } = useAuth();
  const isAdmin = hasRole(me, 'admin');
  const { people, loading, error, reload, updateRoles, approve, remove } =
    usePeople(isAdmin);
  const sortedPeople = [...(people ?? [])].sort(
    (a, b) => pendingFirst(a) - pendingFirst(b),
  );
  // «Пока никто, кроме вас» — считаем по чужим строкам, не по длине списка
  // целиком: сам admin тоже входил через Telegram и есть в GET /users.
  const others = sortedPeople.filter((person) => person.id !== me?.id);

  return (
    <section style={screenSectionStyle}>
      <ScreenHeader
        title={TITLE}
        explanation={isAdmin ? EXPLANATION : TEACHER_EXPLANATION}
        hint={isAdmin ? ROLES_HINT : null}
      />

      <InviteLinkCard />

      {/* Число — рядом со ссылкой, которая его набирает (ADR-0025, ADR-0030). */}
      {isAdmin && !error && people && (
        <p style={countStyle}>
          {formatJoinedViaInviteCount(people.filter((p) => p.joinedViaInvite).length)}
        </p>
      )}

      {isAdmin && error && (
        <LoadErrorBanner message={error} onRetry={() => void reload()} />
      )}

      {isAdmin && loading && people === null && !error && (
        <SkeletonList rows={4} h={96} />
      )}

      {isAdmin && !error && people && others.length === 0 && (
        <p style={{ margin: 0 }}>{EMPTY_MESSAGE}</p>
      )}

      {isAdmin && !error && people && others.length > 0 && (
        <ul style={listStyle}>
          {sortedPeople.map((person) => (
            <PersonRow
              key={person.id}
              person={person}
              isSelf={person.id === me?.id}
              onChangeRoles={(roles) => updateRoles(person.id, { roles })}
              onApprove={() => approve(person.id)}
              onRemove={() => remove(person.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
