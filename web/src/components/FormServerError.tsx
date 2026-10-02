// Блок ошибки сервера под формой — сообщение и, если есть, список подробностей
// из `details` (CLAUDE.md «Одна механика — один компонент»): раньше дублировался
// в формах занятия и занятия расписания, jscpd поймал дубль. `errorFrom` — тоже
// общий кусок: useClassForm.ts и useLessonForm.ts собирали его одинаково.
//
// Код обращения (аудит 2026-10-01, F66): при 5xx сервер кладёт requestId в
// конверт и шлёт владельцу DM с тем же кодом, а на экране его не было —
// жалобу «у меня ошибка» нельзя было связать ни с DM, ни с журналом «Сбоев»
// (RUNBOOK §4). Решение «когда показывать» живёт в `errorFrom` (чистая
// функция, тест без DOM), компонент печатает код целиком: фильтр «Сбоев»
// ищет по полному значению, усечённый пришлось бы дописывать руками.
import { ApiError } from '../api/http';
import { listCardMetaStyle } from './listCardStyles';
import { RichText } from './RichText';

export interface FormError {
  message: string;
  details?: string[];
  /** Только у 5xx — у 4xx ответ сам говорит, что делать, код там не нужен. */
  requestId?: string;
}

const INTERNAL_ERROR_STATUS = 500;
const REQUEST_ID_LABEL = 'Код обращения';

export function errorFrom(err: unknown, fallback: string): FormError {
  if (!(err instanceof ApiError)) return { message: fallback };
  return {
    message: err.message,
    details: err.details,
    requestId: err.status >= INTERNAL_ERROR_STATUS ? err.requestId : undefined,
  };
}

export function FormServerError({ error }: { error: FormError | null }) {
  if (!error) return null;
  return (
    <div role="alert" style={{ color: 'var(--danger)' }}>
      {/* Через RichText (ADR-0124) — текст ошибки сервера доходит с акцентом. */}
      <p style={{ margin: 0 }}>
        <RichText text={error.message} />
      </p>
      {error.details && (
        <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
          {error.details.map((detail) => (
            <li key={detail}>
              <RichText text={detail} />
            </li>
          ))}
        </ul>
      )}
      {error.requestId && (
        <div style={listCardMetaStyle}>
          {REQUEST_ID_LABEL}: <code>{error.requestId}</code>
        </div>
      )}
    </div>
  );
}
