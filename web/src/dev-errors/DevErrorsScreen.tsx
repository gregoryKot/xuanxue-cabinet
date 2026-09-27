// Экран «Сбои» (`/dev/errors`, только admin — RequireDevErrorsAccess,
// ADR-0132) — журнал алёртов «Сбой в браузере»/«Сбой в кабинете»: текст
// ошибки раньше жил только в логах Railway, теперь его видно по коду
// обращения из самого алёрта Telegram (ссылка `?requestId=…`, вход также
// карточкой на «Профиле», profile/ProfileScreen.tsx).
//
// Поиск синхронизирован с адресом (`useSearchParams`), а не своим useState:
// открытая по ссылке из Telegram страница показывает уже отфильтрованный
// список без лишнего рендера с пустым полем. Фильтр «скрыть недогруженный код
// экрана» (`chunk` — деплой обновил чанк, лечится перезагрузкой) — на
// клиенте: он не про то, что искать на сервере, а про то, что заслоняет
// настоящие сбои в списке.
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '../components/Button';
import { Field, inputStyle } from '../components/Field';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { cardListStyle } from '../components/listCardStyles';
import { RichText } from '../components/RichText';
import { screenSectionStyle } from '../components/screenLayout';
import { ScreenHeader } from '../components/ScreenHeader';
import { SkeletonList } from '../components/Skeleton';
import { DevErrorCard } from './DevErrorCard';
import { formatLast24h } from './devErrorsFormat';
import { useDevErrors } from './useDevErrors';

const TITLE = 'Сбои';
const EXPLANATION =
  'Сюда попадают сбои из браузера и сервера — те же, о которых приходит ' +
  'сообщение в Telegram. Хранятся **30 дней**.';
const SEARCH_LABEL = 'Код обращения';
const EMPTY_MESSAGE = 'Пока сбоев нет.';
const NOT_FOUND_MESSAGE =
  'Сбоя с таким кодом нет. Код обращения — из сообщения в Telegram.';
const REQUEST_ID_PARAM = 'requestId';

export default function DevErrorsScreen() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestId = searchParams.get(REQUEST_ID_PARAM) ?? '';
  const trimmedRequestId = requestId.trim();
  const { data, loading, error, reload } = useDevErrors(trimmedRequestId);
  const [showChunk, setShowChunk] = useState(false);

  function handleRequestIdChange(value: string) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(REQUEST_ID_PARAM, value);
        else next.delete(REQUEST_ID_PARAM);
        return next;
      },
      { replace: true },
    );
  }

  const items = data?.items ?? null;
  const chunkCount = items ? items.filter((item) => item.kind === 'chunk').length : 0;
  const visibleItems = items
    ? items.filter((item) => showChunk || item.kind !== 'chunk')
    : null;
  const rawEmpty = items !== null && items.length === 0;

  return (
    <section style={screenSectionStyle}>
      <ScreenHeader title={TITLE} explanation={EXPLANATION} />

      {data && (
        <p style={{ margin: 0 }}>
          <RichText text={formatLast24h(data.last24h)} />
        </p>
      )}

      <Field label={SEARCH_LABEL}>
        <input
          type="search"
          style={inputStyle}
          placeholder="Из сообщения в Telegram"
          value={requestId}
          onChange={(e) => handleRequestIdChange(e.target.value)}
        />
      </Field>

      {error && (
        <LoadErrorBanner
          message={error}
          onRetry={() => void reload()}
          retryLabel="Обновить"
        />
      )}

      {loading && items === null && <SkeletonList rows={4} h={140} />}

      {visibleItems && visibleItems.length > 0 && (
        <ul style={cardListStyle}>
          {visibleItems.map((item) => (
            <DevErrorCard key={item.id} error={item} />
          ))}
        </ul>
      )}

      {rawEmpty && (
        <p style={{ margin: 0 }}>
          {trimmedRequestId ? NOT_FOUND_MESSAGE : EMPTY_MESSAGE}
        </p>
      )}

      {chunkCount > 0 && (
        <Button variant="secondary" onClick={() => setShowChunk((prev) => !prev)}>
          {showChunk
            ? `Скрыть недогруженный код экрана (${chunkCount})`
            : `Показать недогруженный код экрана (${chunkCount})`}
        </Button>
      )}
    </section>
  );
}
