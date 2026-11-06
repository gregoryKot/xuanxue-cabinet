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
  /** См. CallbackErrorAction.tsx — приписка под 403. */
  hint?: string;
  /** Подпись кнопки не-403 ошибки — см. CallbackErrorAction.tsx. */
  buttonLabel: string;
  /** См. TitledDeadEnd.tsx/CallbackErrorAction.tsx. */
  hasSession?: boolean;
}

export function CallbackInProgress({
  error,
  errorStatus,
  hint,
  buttonLabel,
  hasSession = false,
}: CallbackInProgressProps) {
  return (
    <EntryColumn>
      <h1 style={screenTitleStyle}>Входим в кабинет</h1>
      {error ? (
        <>
          <p role="alert" style={errorTextStyle}>
            {error}
          </p>
          <CallbackErrorAction
            errorStatus={errorStatus}
            hint={hint}
            buttonLabel={buttonLabel}
            hasSession={hasSession}
          />
        </>
      ) : (
        <SkeletonLines widths={['70%', '40%']} />
      )}
    </EntryColumn>
  );
}
