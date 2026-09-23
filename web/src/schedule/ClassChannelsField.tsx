// Секция «Каналы рассылки» на странице занятия — какие каналы получат ссылку и
// запись (docs/PLAN.md §6 п.1, ревью п.1). Каналы грузит сама страница
// занятия (useChannels(true) в ClassEditorScreen) и передаёт сюда готовым
// списком — до формы, иначе новому занятию нечего отметить. Механика чекбоксов —
// общий ChannelPicker (pr-k3-fixes.md п.9), здесь только своя подпись и
// текст пустого состояния.
// Подсказка честная про момент подключения (баг, найденный при аудите):
// бот подключает Telegram-группу к НОВЫМ занятиям в момент их создания
// (ClassesService.create, useClassForm — активные каналы отмечены заранее),
// а не задним числом ко всем занятиям школы — старое занятие своих каналов
// не получает само, только через этот список.
import { Link } from 'react-router-dom';
import type { ChannelDto } from '@xuanxue/shared';
import { ChannelPicker } from '../channels/ChannelPicker';
import { RichText } from '../components/RichText';
import { textLinkStyle } from '../components/screenLayout';

const EXPLANATION =
  'Сюда уйдут ссылка на занятие и запись. Telegram-группы с ботом подключаются к **новым занятиям** сами.';

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
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-soft)' }}>
          <RichText text={EXPLANATION} />
        </p>
      }
      emptyMessage={
        <>
          Каналов пока нет. Добавьте их на экране{' '}
          <Link to="/channels" style={textLinkStyle}>
            «Каналы»
          </Link>{' '}
          — потом выберите здесь.
        </>
      }
    />
  );
}
