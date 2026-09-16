// «Ученики» — те, кто зарегистрировался по ссылке-приглашению школы
// (ADR-0030/0034), и назначение ролей учитель/админ (docs/PLAN.md §6,
// блокер аудита Б3: до этого экрана вторую роль назначали правкой Atlas
// руками). Маршрут /people открыт admin и teacher (RequirePeopleAccess,
// ADR-0030 — ссылку-приглашение отдаёт и учитель), но список учеников, роли
// и удаление данных внутри экрана видит только admin (SECURITY §3) —
// teacher видит только ссылку-приглашение.
// Облик — направление «тихо и благородно» (docs/adr/0031), как «Занятия» и
// «Вопросы»: заголовок антиквой через ScreenHeader, люди — строками на
// волосяных линиях, без киновари — подтверждать на «Людях» больше некого
// (ADR-0034), единственный акцент экрана — ссылка-приглашение.
import type { CSSProperties } from 'react';
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
const EXPLANATION = 'Здесь те, кто зарегистрировался по ссылке-приглашению.';
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

export default function PeopleScreen() {
  const { me } = useAuth();
  const isAdmin = hasRole(me, 'admin');
  const { people, loading, error, reload, updateRoles, remove } = usePeople(isAdmin);
  // «Пока никто, кроме вас» — считаем по чужим строкам, не по длине списка
  // целиком: сам admin тоже входил через Telegram и есть в GET /users.
  const others = (people ?? []).filter((person) => person.id !== me?.id);

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
          {people.map((person) => (
            <PersonRow
              key={person.id}
              person={person}
              isSelf={person.id === me?.id}
              onChangeRoles={(roles) => updateRoles(person.id, { roles })}
              onRemove={() => remove(person.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
