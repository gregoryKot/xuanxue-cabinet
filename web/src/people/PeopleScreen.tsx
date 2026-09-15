// «Ученики» — те, кто хоть раз вошёл в кабинет через Telegram, и назначение
// ролей учитель/админ (docs/PLAN.md §6, блокер аудита Б3: до этого экрана
// вторую роль назначали правкой Atlas руками). Маршрут /people открыт admin
// и teacher (RequirePeopleAccess, ADR-0030 — ссылку-приглашение отдаёт и
// учитель), но список учеников, роли и удаление данных внутри экрана видит
// только admin (SECURITY §3) — teacher видит только карточку ссылки.
// Заголовок экрана — здесь, в отличие от других разделов: раньше вход был
// скрытой ссылкой на «Сводке», теперь это полноценный пункт меню.
import type { CSSProperties } from 'react';
import type { UserDto } from '@xuanxue/shared';
import { useAuth } from '../auth/AuthProvider';
import { hasRole } from '../auth/hasRole';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { screenExplanationStyle, screenSectionStyle } from '../components/screenLayout';
import { SkeletonList } from '../components/Skeleton';
import { formatJoinedViaInviteCount } from './formatJoinedViaInviteCount';
import { InviteLinkCard } from './InviteLinkCard';
import { PersonRow } from './PersonRow';
import { usePeople } from './usePeople';

const EXPLANATION =
  'Здесь те, кто хотя бы раз вошёл в кабинет через Telegram. После первого входа человек ждёт вашего подтверждения — он стоит вверху списка. Отметьте, кто ведёт занятия: учитель видит расписание, рассылки и получает уведомления бота, а администратор ещё и назначает роли.';
const TEACHER_EXPLANATION =
  'Список учеников и назначение ролей видит только администратор — вам здесь доступна ссылка-приглашение школы.';
const EMPTY_MESSAGE =
  'Пока никто, кроме вас, не входил. Дайте ссылку на кабинет — после первого входа человек появится здесь.';

const listStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};

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
      <h1 style={{ fontSize: 22, margin: 0 }}>Ученики</h1>
      <p style={screenExplanationStyle}>{isAdmin ? EXPLANATION : TEACHER_EXPLANATION}</p>

      <InviteLinkCard />

      {isAdmin && error && (
        <LoadErrorBanner message={error} onRetry={() => void reload()} />
      )}

      {isAdmin && loading && people === null && !error && (
        <SkeletonList rows={4} h={96} />
      )}

      {isAdmin && !error && people && (
        <p style={{ margin: 0, color: 'var(--ink-soft)' }}>
          {formatJoinedViaInviteCount(people.filter((p) => p.joinedViaInvite).length)}
        </p>
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
