// Общий шаг миграций, которые убирают вид уведомления из проекта совсем
// (ADR-0062 — «Сообщение от учителя», ADR-0069 — «Занятие скоро»). Правило
// CLAUDE.md «Отказались от механики — удаляем с концами» распространяется на
// данные, не только на код: вида больше нет в `NOTIFICATION_KINDS`, но у
// человека, который хоть раз переключал его руками, в
// `notification_prefs.overrides` остаётся элемент со значением вне enum
// подсхемы (`NotificationOverrideSubdoc`, notification-prefs.schema.ts).
//
// Запись таким документом не падает: `NotificationPrefsService.set` пишет
// через `updateOne` без `runValidators`, `.save()` на этой модели нигде не
// вызывается — это закрытие скрытой ловушки на будущее, а не починка
// существующего сбоя: включит кто-нибудь `runValidators` или `.save()` на
// этой схеме — откажут ровно те, кто настройки трогал руками, то есть самые
// заинтересованные люди.
//
// expand → deploy → contract: старый инстанс во время деплоя ещё собран со
// старым `NotificationKind` и может писать и читать overrides убранного вида,
// но удаление элемента-переключателя для него неотличимо от «человек никогда
// не трогал этот вид» — `NotificationPrefsService.get` вернёт дефолт роли,
// как и для любого другого нетронутого вида (apply-overrides.ts). Безопасно
// и при деплое, и при откате.
//
// Отдельный модуль, а не копия в каждой миграции: шаг повторился во второй
// раз, и дальше повторится снова (CLAUDE.md «Дубли», гейт jscpd). Сами
// миграции остаются каждая своей — у них свои `id` в коллекции `migrations`
// и своё убираемое значение.
import type { mongo } from 'mongoose';

// `mongo` — реэкспорт того же драйвера, что использует mongoose внутри
// (mongoose.mongo === require('mongodb')), поэтому тип `Db` совпадает
// с тем, что отдаёт `connection.db` — без второй копии пакета `mongodb`
// в дереве зависимостей.
type Db = mongo.Db;

const NOTIFICATION_PREFS = 'notification_prefs';

// Минимальная форма документа для типизации `$pull` нативного драйвера —
// на generic `Document` (без параметра типа) он не принимает объект-фильтр
// элемента массива (`PullOperator` требует знать форму `overrides`), тот же
// приём, что `MigrationsDoc` в migration.runner.ts.
interface NotificationPrefsDoc {
  overrides: { kind: string; enabled: boolean }[];
}

/** Убирает переключатель этого вида из `overrides` у всех, у кого он есть.
 * `kind` — сырая строка, а не `NotificationKind`: значение убрано из типа,
 * миграция хранит исторический факт о данных. Идемпотентность бесплатная:
 * второй запуск не находит ни одного элемента с этим `kind` — фильтр не
 * совпадает ни с одним документом, `$pull` не за что применять. */
export async function pullNotificationOverride(db: Db, kind: string): Promise<void> {
  await db
    .collection<NotificationPrefsDoc>(NOTIFICATION_PREFS)
    .updateMany({ 'overrides.kind': kind }, { $pull: { overrides: { kind } } });
}
