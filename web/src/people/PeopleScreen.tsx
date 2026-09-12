// «Ученики» — те, кто хоть раз вошёл в кабинет через Telegram, и назначение
// ролей учитель/админ (docs/PLAN.md §6, блокер аудита Б3: до этого экрана
// вторую роль назначали правкой Atlas руками). Доступен только admin —
// маршрут /people защищён RequireAdmin (App.tsx) и скрыт в навигации от
// остальных (navItems.ts, docs/adr/0025-navigation-by-domain.md). Заголовок
// экрана — здесь, в отличие от других разделов: раньше вход был скрытой
// ссылкой на «Сводке», теперь это полноценный пункт меню.
import type { CSSProperties } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { screenExplanationStyle, screenSectionStyle } from '../components/screenLayout';
import { SkeletonList } from '../components/Skeleton';
import { PersonRow } from './PersonRow';
import { usePeople } from './usePeople';

const EXPLANATION =
  'Здесь те, кто хотя бы раз вошёл в кабинет через Telegram. Отметьте, кто ведёт занятия: учитель видит расписание, рассылки и получает уведомления бота, а администратор ещё и назначает роли.';
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

export default function PeopleScreen() {
  const { me } = useAuth();
  const { people, loading, error, reload, updateRoles, remove } = usePeople();
  // «Пока никто, кроме вас» — считаем по чужим строкам, не по длине списка
  // целиком: сам admin тоже входил через Telegram и есть в GET /users.
  const others = people?.filter((person) => person.id !== me?.id) ?? [];

  return (
    <section style={screenSectionStyle}>
      <h1 style={{ fontSize: 22, margin: 0 }}>Ученики</h1>
      <p style={screenExplanationStyle}>{EXPLANATION}</p>

      {error && <LoadErrorBanner message={error} onRetry={() => void reload()} />}

      {loading && people === null && !error && <SkeletonList rows={4} h={96} />}

      {!error && people && others.length === 0 && (
        <p style={{ margin: 0 }}>{EMPTY_MESSAGE}</p>
      )}

      {!error && people && others.length > 0 && (
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
