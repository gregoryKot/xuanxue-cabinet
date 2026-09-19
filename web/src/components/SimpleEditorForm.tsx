// Каркас страницы-редактора без статуса (макет Form.dc.html, ADR-0033):
// возврат к списку, рубрика с заголовком, поля-слот, ошибка сервера,
// «Сохранить» и необязательное удаление с подтверждением. Статусный подвал
// (draft/published/archived — экзамен, вопрос) — отдельный
// components/EditorFooter.tsx, сюда не подходит (материал и канал статусов
// не проходят). Раньше повторялся целиком в ChannelEditorForm.tsx и
// MaterialEditorForm.tsx — jscpd поймал дубль на PR слоя 3.2 (CLAUDE.md
// «Одна механика — один компонент»); теперь оба экрана — только свои поля и
// тексты, каркас и навигация после сохранения/удаления — здесь.
import type { FormEvent, ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, type ButtonVariant } from './Button';
import { ConfirmDialog } from './ConfirmDialog';
import { FormServerError, type FormError } from './FormServerError';
import { screenTitleStyle } from './screenLayout';
import {
  backLinkStyle,
  editorHeadingStyle,
  editorPageStyle,
  editorSectionStyle,
} from './editorLayout';
import { useConfirmedRemove } from '../hooks/useConfirmedRemove';

const SAVE_LABEL = 'Сохранить';
const CONFIRM_REMOVE_LABEL = 'Удалить';
// Удаление стоит под волосяной линией и отбито от «Сохранить» — киноварь на
// экране одна, у главного действия; опасное — только текстом в --danger
// (Button, variant="danger", отзыв владельца 2026-09-16).
const removeRowStyle = {
  marginTop: 22,
  paddingTop: 16,
  borderTop: '1px solid var(--line)',
};
const removeButtonStyle = { padding: 0 };

/** Есть у уже существующей записи — новой ещё нечего удалять (проп `remove`
 * не передают, пока `entity` пуст, тот же приём, что решает про заголовок). */
interface SimpleEditorFormRemove {
  label: string;
  confirmTitle: string;
  confirmMessage: string;
  confirmVariant?: ButtonVariant;
  onRemove: () => Promise<boolean>;
}

interface SimpleEditorFormProps {
  backPath: string;
  backText: string;
  eyebrow: string;
  title: string;
  serverError: FormError | null;
  pending: boolean;
  onSubmit: () => Promise<boolean>;
  remove?: SimpleEditorFormRemove;
  /** Поля формы — рубрика и заголовок уже нарисованы, здесь только контролы. */
  children: ReactNode;
  /** Контент внутри `<form>` после подвала «Сохранить»/«Удалить» — например,
   * проверка канала тестовым сообщением (ChannelTestSection.tsx). */
  afterFooter?: ReactNode;
}

export function SimpleEditorForm({
  backPath,
  backText,
  eyebrow,
  title,
  serverError,
  pending,
  onSubmit,
  remove,
  children,
  afterFooter,
}: SimpleEditorFormProps) {
  const navigate = useNavigate();
  // `void` у navigate — он возвращает промис (react-router 7), а вызывающие
  // места ждут обычную функцию без результата.
  const goToList = () => void navigate(backPath);
  const removeConfirm = useConfirmedRemove(remove?.onRemove, goToList);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (await onSubmit()) goToList();
  }

  return (
    <>
      <form style={editorPageStyle} onSubmit={(e) => void handleSubmit(e)}>
        <Link to={backPath} style={backLinkStyle}>
          {backText}
        </Link>

        <div style={editorHeadingStyle}>
          <span className="xuanxue-eyebrow">{eyebrow}</span>
          <h1 style={screenTitleStyle}>{title}</h1>
        </div>

        {children}

        <FormServerError error={serverError} />

        <div style={editorSectionStyle}>
          <Button type="submit" pending={pending}>
            {SAVE_LABEL}
          </Button>
          {remove && (
            <div style={removeRowStyle}>
              <Button
                type="button"
                variant="danger"
                style={removeButtonStyle}
                pending={pending}
                onClick={removeConfirm.requestRemove}
              >
                {remove.label}
              </Button>
            </div>
          )}
        </div>

        {afterFooter}
      </form>

      {remove && removeConfirm.confirming && (
        <ConfirmDialog
          title={remove.confirmTitle}
          message={remove.confirmMessage}
          confirmLabel={CONFIRM_REMOVE_LABEL}
          confirmVariant={remove.confirmVariant}
          pending={pending}
          onConfirm={removeConfirm.confirmRemove}
          onCancel={removeConfirm.cancelRemove}
        />
      )}
    </>
  );
}
