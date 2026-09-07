// Секция «Каналы рассылки» в листе занятия — какие каналы получат ссылку и
// запись (docs/PLAN.md §6 п.1, ревью п.1). Каналы грузятся один раз на
// экран «Расписание» (useChannels(true) в ScheduleScreen) и передаются сюда
// готовым списком — лист их не запрашивает сам. Сама механика чекбоксов —
// общий ChannelPicker (pr-k3-fixes.md п.9), здесь только своя подпись и
// текст пустого состояния.
import { Link } from 'react-router-dom';
import type { ChannelDto } from '@xuanxue/shared';
import { ChannelPicker } from '../channels/ChannelPicker';

const EXPLANATION =
  'Сюда уйдут ссылка на занятие и запись. Telegram-группа с ботом подключается ко всем занятиям сама.';

interface ClassChannelsFieldProps {
  channels: ChannelDto[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function ClassChannelsField({
  channels,
  selectedIds,
  onChange,
}: ClassChannelsFieldProps) {
  return (
    <ChannelPicker
      legend="Каналы рассылки"
      channels={channels}
      selectedIds={selectedIds}
      onChange={onChange}
      hint={
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-soft)' }}>{EXPLANATION}</p>
      }
      emptyMessage={
        <>
          Каналов пока нет. Добавьте их на экране <Link to="/channels">«Каналы»</Link> —
          потом выберите здесь.
        </>
      }
    />
  );
}
