// Блок ошибки сервера под формой — сообщение и, если есть, список подробностей
// из `details` (CLAUDE.md «Одна механика — один компонент»): раньше дублировался
// в ClassSheet.tsx и LessonSheet.tsx, jscpd поймал дубль. `errorFrom` — тоже
// общий кусок: useClassForm.ts и useLessonForm.ts собирали его одинаково.
import { ApiError } from '../api/http';

export interface FormError {
  message: string;
  details?: string[];
}

export function errorFrom(err: unknown, fallback: string): FormError {
  return err instanceof ApiError
    ? { message: err.message, details: err.details }
    : { message: fallback };
}

export function FormServerError({ error }: { error: FormError | null }) {
  if (!error) return null;
  return (
    <div role="alert" style={{ color: 'var(--danger)' }}>
      <p style={{ margin: 0 }}>{error.message}</p>
      {error.details && (
        <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
          {error.details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
