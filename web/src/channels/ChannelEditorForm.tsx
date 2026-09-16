// Страница канала — адрес, а не лист поверх списка (макет Form.dc.html,
// ADR-0033). Сверху вниз: возврат к списку, рубрика с заголовком, поля
// канала, сохранение с удалением, под ними — проверка канала тестовым
// сообщением.
//
// Переключатель «Включён» стоит полем формы, а не отдельной кнопкой в списке:
// в списке строка канала осталась строкой (ChannelCard.tsx), а здесь он
// уезжает на сервер тем же PATCH, что название и настройки.
import type { CSSProperties, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ChannelDto } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FormServerError } from '../components/FormServerError';
import {
  editorHeadingStyle,
  editorPageStyle,
  editorSectionStyle,
  screenTitleStyle,
  textLinkStyle,
} from '../components/screenLayout';
import { useConfirmedRemove } from '../hooks/useConfirmedRemove';
import { ChannelFormFields } from './ChannelFormFields';
import { ChannelTestSection } from './ChannelTestSection';
import { useChannelForm } from './useChannelForm';
import type { UseChannelEditorResult } from './useChannelEditor';

const CHANNELS_PATH = '/channels';
const BACK_TEXT = 'К списку каналов';
const NEW_CHANNEL_TITLE = 'Новый канал';
const REMOVE_LABEL = 'Удалить канал';
const REMOVE_MESSAGE =
  'Рассылки перестанут уходить в этот канал. Отменить нельзя — канал придётся подключить заново.';
// Удаление стоит под волосяной линией и отбито от «Сохранить» — тем же
// ритмом, что подвал редактора экзамена (components/EditorFooter.tsx).
// Рядом с киноварью «Сохранить» красный текст читался вторым акцентом
// (отзыв владельца 2026-09-16): киноварь на экране одна, у главного
// действия, опасное — только текстом в --danger (Button, variant="danger").
const removeRowStyle: CSSProperties = {
  marginTop: 22,
  paddingTop: 16,
  borderTop: '1px solid var(--line)',
};
const removeButtonStyle: CSSProperties = { padding: 0 };

interface ChannelEditorFormProps {
  channel: ChannelDto | null;
  editor: UseChannelEditorResult;
}

export function ChannelEditorForm({ channel, editor }: ChannelEditorFormProps) {
  const navigate = useNavigate();
  // `void` у navigate — он возвращает промис (react-router 7), а вызывающие
  // места ждут обычную функцию без результата.
  const goToList = () => void navigate(CHANNELS_PATH);
  const form = useChannelForm(channel, editor.create, editor.update, editor.remove);
  const removeConfirm = useConfirmedRemove(form.remove, goToList);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (await form.submit()) goToList();
  }

  return (
    <>
      <form style={editorPageStyle} onSubmit={(e) => void handleSubmit(e)}>
        <Link to={CHANNELS_PATH} style={textLinkStyle}>
          {BACK_TEXT}
        </Link>

        <div style={editorHeadingStyle}>
          <span className="xuanxue-eyebrow">Канал</span>
          <h1 style={screenTitleStyle}>{channel ? channel.title : NEW_CHANNEL_TITLE}</h1>
        </div>

        <ChannelFormFields
          state={form.state}
          setField={form.setField}
          error={form.validationError}
          isCreate={!channel}
        />

        <FormServerError error={form.serverError} />

        <div style={editorSectionStyle}>
          <Button type="submit" pending={form.pending}>
            Сохранить
          </Button>
          {channel && (
            <div style={removeRowStyle}>
              <Button
                type="button"
                variant="danger"
                style={removeButtonStyle}
                pending={form.pending}
                onClick={removeConfirm.requestRemove}
              >
                {REMOVE_LABEL}
              </Button>
            </div>
          )}
        </div>

        {channel && <ChannelTestSection channel={channel} />}
      </form>

      {removeConfirm.confirming && (
        <ConfirmDialog
          title="Удалить канал?"
          message={REMOVE_MESSAGE}
          confirmLabel="Удалить"
          pending={form.pending}
          onConfirm={removeConfirm.confirmRemove}
          onCancel={removeConfirm.cancelRemove}
        />
      )}
    </>
  );
}
