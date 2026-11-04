// Страница канала — адрес, а не лист поверх списка (макет Form.dc.html,
// ADR-0033). Каркас (возврат к списку, рубрика, подвал «Сохранить»/
// «Удалить») — общий components/SimpleEditorForm.tsx (материал устроен тем
// же приёмом, MaterialEditorForm.tsx): здесь только поля канала и проверка
// тестовым сообщением после подвала.
//
// Выключателя у канала нет (ADR-0194): ненужный канал удаляют, а «пока не
// слать» — «Снять все» в секции занятий. После подвала — две отдельные
// секции со своим сохранением: занятия канала (ChannelClassesSection.tsx) и
// тестовое сообщение.
import type { ChannelDto } from '@xuanxue/shared';
import { SimpleEditorForm } from '../components/SimpleEditorForm';
import { ChannelFormFields } from './ChannelFormFields';
import { ChannelClassesSection } from './ChannelClassesSection';
import { ChannelTestSection } from './ChannelTestSection';
import { useChannelForm } from './useChannelForm';
import type { UseChannelEditorResult } from './useChannelEditor';

const CHANNELS_PATH = '/channels';
const BACK_TEXT = 'К списку каналов';
const NEW_CHANNEL_TITLE = 'Новый канал';
const REMOVE_LABEL = 'Удалить канал';
const REMOVE_MESSAGE =
  'Рассылки перестанут уходить в этот канал. Отменить нельзя — **канал придётся подключить заново**.';

interface ChannelEditorFormProps {
  channel: ChannelDto | null;
  editor: UseChannelEditorResult;
}

export function ChannelEditorForm({ channel, editor }: ChannelEditorFormProps) {
  const form = useChannelForm(channel, editor.create, editor.update, editor.remove);

  return (
    <SimpleEditorForm
      backPath={CHANNELS_PATH}
      backText={BACK_TEXT}
      eyebrow="Канал"
      title={channel ? channel.title : NEW_CHANNEL_TITLE}
      serverError={form.serverError}
      pending={form.pending}
      onSubmit={form.submit}
      remove={
        channel
          ? {
              label: REMOVE_LABEL,
              confirmTitle: 'Удалить канал?',
              confirmMessage: REMOVE_MESSAGE,
              onRemove: form.remove,
            }
          : undefined
      }
      afterFooter={
        channel && (
          <>
            <ChannelClassesSection channel={channel} />
            <ChannelTestSection channel={channel} />
          </>
        )
      }
    >
      <ChannelFormFields
        state={form.state}
        setField={form.setField}
        error={form.validationError}
        isCreate={!channel}
      />
    </SimpleEditorForm>
  );
}
