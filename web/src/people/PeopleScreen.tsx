// «Ученики» — те, кто зарегистрировался по ссылке-приглашению школы
// (ADR-0030/0036), и назначение ролей учитель/админ (docs/PLAN.md §6,
// блокер аудита Б3: до этого экрана вторую роль назначали правкой Atlas
// руками). Маршрут /people открыт admin и teacher (RequirePeopleAccess,
// ADR-0030 — ссылку-приглашение отдаёт и учитель), но список учеников, роли
// и удаление данных внутри экрана видит только admin (SECURITY §3) —
// teacher видит только ссылку-приглашение.
// Облик — направление «Тёплая школа» (docs/adr/0043), макет
// 2c-people.html: заголовок антиквой через ScreenHeader, карточка
// ссылки-приглашения (InviteLinkCard.tsx) и список одной карточкой, как у
// «Рассылок»/«Экзаменов» (#199, #200). Главной кнопки в шапке нет — действия
// экрана живут в карточке приглашения, подтверждать на «Людях» больше
// некого (ADR-0036).
import type { CSSProperties } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { hasRole } from '../auth/hasRole';
import { oneCardListStyle } from '../components/listCardStyles';
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
// После ADR-0036 вход без ссылки-приглашения получает 403 — текст ведёт к
// карточке «Ссылка-приглашение» выше на этом же экране, а не к «дайте ссылку
// на кабинет» (кабинет по прямой ссылке больше не пускает).
const EMPTY_MESSAGE =
  'Пока никто, кроме вас, не входил. Отправьте ссылку-приглашение из карточки выше.';

const countStyle: CSSProperties = { margin: 0, fontSize: 13, color: 'var(--ink-soft)' };

export default function PeopleScreen() {
  const { me } = useAuth();
  const isAdmin = hasRole(me, 'admin');
  const { people, loading, error, reload, updateRoles, updateStatus, remove } =
    usePeople(isAdmin);
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
        <ul style={oneCardListStyle}>
          {people.map((person, index, all) => (
            <PersonRow
              key={person.id}
              person={person}
              isSelf={person.id === me?.id}
              onChangeRoles={(roles) => updateRoles(person.id, { roles })}
              onChangeStatus={(status) => updateStatus(person.id, status)}
              onRemove={() => remove(person.id)}
              isLast={index === all.length - 1}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
