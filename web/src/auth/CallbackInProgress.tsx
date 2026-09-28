// Экран, пока идёт (или упал) сам POST callback-входа — скелетон, пока ждём
// ответ, иначе текст ошибки и действие (CallbackErrorAction.tsx). Общий вид
// EmailLoginCallbackScreen.tsx и GoogleLoginCallbackScreen.tsx (CLAUDE.md
// «Одна механика — один компонент», jscpd).
import type { CSSProperties } from 'react';
import { EntryColumn } from '../components/EntryColumn';
import { SkeletonLines } from '../components/Skeleton';
import { screenTitleStyle } from '../components/screenLayout';
import { CallbackErrorAction } from './CallbackErrorAction';

const errorTextStyle: CSSProperties = { margin: 0, color: 'var(--danger)' };

interface CallbackInProgressProps {
  error: string | null;
  errorStatus: number | null;
  /** Подпись кнопки не-403 ошибки — см. CallbackErrorAction.tsx. */
  buttonLabel: string;
}

export function CallbackInProgress({
  error,
  errorStatus,
  buttonLabel,
}: CallbackInProgressProps) {
  return (
    <EntryColumn>
      <h1 style={screenTitleStyle}>Входим в кабинет</h1>
      {error ? (
        <>
          <p role="alert" style={errorTextStyle}>
            {error}
          </p>
          <CallbackErrorAction errorStatus={errorStatus} buttonLabel={buttonLabel} />
        </>
      ) : (
        <SkeletonLines widths={['70%', '40%']} />
      )}
    </EntryColumn>
  );
}
