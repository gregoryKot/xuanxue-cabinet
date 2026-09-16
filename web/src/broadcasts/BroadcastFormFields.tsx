// Поля страницы «Новая рассылка» — вынесены из BroadcastNewForm (CLAUDE.md
// «Файлы»). Предпросмотр показывает текст как есть — рассылку пишет учитель
// сам, мы её не правим (CLAUDE.md «Обращение — только „вы“»): это просто
// то, что напечатано в textarea, без рендера плейсхолдеров — у разовой
// рассылки нет шаблона (docs/PLAN.md §6 п.5). Список каналов — общий
// ChannelPicker (pr-k3-fixes.md п.9). Ошибка — `{ field, message }»
// (broadcastFormInput.ts) — под конкретным полем, фокус туда же при её
// появлении (pr-k3-fixes.md п.6).
import { useEffect, useRef } from 'react';
import { BROADCAST_LIMITS, type ChannelDto } from '@xuanxue/shared';
import { Field, inputStyle } from '../components/Field';
import { PostPreview } from '../components/PostPreview';
import { Toggle } from '../components/Toggle';
import { ChannelPicker } from '../channels/ChannelPicker';
import type { BroadcastFormError, BroadcastFormState } from './broadcastFormInput';

const NO_ACTIVE_CHANNELS_MESSAGE =
  'Нет ни одного включённого канала — включите канал на экране «Каналы».';

interface BroadcastFormFieldsProps {
  state: BroadcastFormState;
  setField: <K extends keyof BroadcastFormState>(
    key: K,
    value: BroadcastFormState[K],
  ) => void;
  error: BroadcastFormError | null;
  channels: ChannelDto[];
}

export function BroadcastFormFields({
  state,
  setField,
  error,
  channels,
}: BroadcastFormFieldsProps) {
  const textRef = useRef<HTMLTextAreaElement>(null);
  const channelsRef = useRef<HTMLFieldSetElement>(null);
  const scheduledAtRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!error) return;
    if (error.field === 'text') textRef.current?.focus();
    else if (error.field === 'channelIds') channelsRef.current?.focus();
    else if (error.field === 'scheduledAtLocal') scheduledAtRef.current?.focus();
  }, [error]);

  return (
    <>
      <Field
        label="Текст"
        hint={`${state.text.length} / ${BROADCAST_LIMITS.text}`}
        error={error?.field === 'text' ? error.message : undefined}
      >
        <textarea
          ref={textRef}
          style={{ ...inputStyle, minHeight: 120 }}
          value={state.text}
          onChange={(e) => setField('text', e.target.value)}
        />
      </Field>

      <ChannelPicker
        ref={channelsRef}
        legend="Каналы"
        channels={channels}
        selectedIds={state.channelIds}
        onChange={(ids) => setField('channelIds', ids)}
        emptyMessage={NO_ACTIVE_CHANNELS_MESSAGE}
        error={error?.field === 'channelIds' ? error.message : undefined}
      />

      <Toggle
        label="Отправить сейчас"
        checked={state.scheduleNow}
        onChange={(checked) => setField('scheduleNow', checked)}
      />
      {!state.scheduleNow && (
        <Field
          label="Время отправки"
          error={error?.field === 'scheduledAtLocal' ? error.message : undefined}
        >
          <input
            ref={scheduledAtRef}
            type="datetime-local"
            style={inputStyle}
            value={state.scheduledAtLocal}
            onChange={(e) => setField('scheduledAtLocal', e.target.value)}
          />
        </Field>
      )}

      <div>
        <p style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 600 }}>Предпросмотр</p>
        <PostPreview text={state.text || '—'} />
      </div>
    </>
  );
}
