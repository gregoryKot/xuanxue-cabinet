// Список каналов галочками — одна механика на кабинет (CLAUDE.md «Одна
// механика — один компонент», pr-k3-fixes.md п.9). Сама механика чекбоксов —
// общий components/CheckboxListField.tsx (материалы, слой 3.2, привязывают
// занятия ровно тем же приёмом, MaterialClassesField.tsx): здесь только свой
// вид подписи «тип · название» и своя карточка пропсов, знакомая остальному
// кабинету (ClassChannelsField.tsx, broadcasts/BroadcastFormFields.tsx).
import { forwardRef, type ReactNode } from 'react';
import type { ChannelDto } from '@xuanxue/shared';
import { CheckboxListField } from '../components/CheckboxListField';
import { CHANNEL_TYPE_LABELS_RU } from './channelTypeLabels';

interface ChannelPickerProps {
  legend: string;
  channels: ChannelDto[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  hint?: ReactNode;
  emptyMessage: ReactNode;
  error?: string;
}

export const ChannelPicker = forwardRef<HTMLFieldSetElement, ChannelPickerProps>(
  function ChannelPicker(
    { legend, channels, selectedIds, onChange, hint, emptyMessage, error },
    ref,
  ) {
    const options = channels.map((channel) => ({
      id: channel.id,
      label: `${CHANNEL_TYPE_LABELS_RU[channel.type]} · ${channel.title}`,
    }));

    return (
      <CheckboxListField
        ref={ref}
        legend={legend}
        options={options}
        selectedIds={selectedIds}
        onChange={onChange}
        hint={hint}
        emptyMessage={emptyMessage}
        error={error}
      />
    );
  },
);
