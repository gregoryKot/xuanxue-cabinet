// Страница материала — адрес, а не лист поверх списка (ADR-0033). Каркас
// (возврат к списку, рубрика, подвал «Сохранить»/«Удалить») — общий
// components/SimpleEditorForm.tsx (тот же приём, что у канала,
// ChannelEditorForm.tsx): здесь только поля материала.
import type { ClassDto, MaterialDto } from '@xuanxue/shared';
import { MATERIALS_PATH } from '../api/apiPaths';
import { FormDraftNote } from '../components/FormDraftNote';
import { SimpleEditorForm } from '../components/SimpleEditorForm';
import { MaterialFormFields } from './MaterialFormFields';
import { useMaterialForm } from './useMaterialForm';
import type { UseMaterialEditorResult } from './useMaterialEditor';

const BACK_TEXT = 'К библиотеке';
const NEW_MATERIAL_TITLE = 'Новый материал';
const REMOVE_LABEL = 'Удалить материал';
const REMOVE_MESSAGE = 'Материал исчезнет из библиотеки ученика. Отменить нельзя.';

interface MaterialEditorFormProps {
  material: MaterialDto | null;
  classes: ClassDto[];
  editor: UseMaterialEditorResult;
}

export function MaterialEditorForm({
  material,
  classes,
  editor,
}: MaterialEditorFormProps) {
  const form = useMaterialForm(material, editor.create, editor.update, editor.remove);

  return (
    <SimpleEditorForm
      backPath={MATERIALS_PATH}
      backText={BACK_TEXT}
      eyebrow="Материал"
      title={material ? material.title : NEW_MATERIAL_TITLE}
      serverError={form.serverError}
      pending={form.pending}
      onSubmit={form.submit}
      remove={
        material
          ? {
              label: REMOVE_LABEL,
              confirmTitle: 'Удалить материал?',
              confirmMessage: REMOVE_MESSAGE,
              onRemove: form.remove,
            }
          : undefined
      }
    >
      {/* Строка о восстановленном черновике стоит над полями (ADR-0052,
          ExamItemEditorForm.tsx) — иначе человек правит набранное в прошлый
          раз, не понимая, откуда оно взялось. */}
      <FormDraftNote restored={form.draftRestored} onDiscard={form.discardDraft} />
      <MaterialFormFields
        state={form.state}
        setField={form.setField}
        error={form.validationError}
        classes={classes}
      />
    </SimpleEditorForm>
  );
}
