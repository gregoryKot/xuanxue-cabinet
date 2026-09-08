#!/usr/bin/env bash
# Восстановление бэкапа MongoDB: расшифровать → mongorestore --drop.
# Без --yes только показывает, что было бы сделано — восстановление стирает базу
# целиком (--drop), случайный запуск на проде недопустим (docs/RUNBOOK.md §7).
set -euo pipefail

usage() {
  echo "Использование: $0 <файл.archive.gz.enc> [--yes] [--from-db=<имя>]" >&2
  echo "  без --yes — только печатает, что будет сделано (dry-run)." >&2
  echo "  --from-db=<имя> — восстановить в базу из URI под другим именем (учения," >&2
  echo "  CI): mongorestore --archive сам по себе пишет в базу с именем из дампа." >&2
  exit 1
}

ARCHIVE_FILE=""
CONFIRM=""
FROM_DB=""
for arg in "$@"; do
  case "$arg" in
    --yes) CONFIRM=1 ;;
    --from-db=*) FROM_DB="${arg#--from-db=}" ;;
    -h | --help) usage ;;
    *) ARCHIVE_FILE="$arg" ;;
  esac
done

[ -n "$ARCHIVE_FILE" ] || usage
if [ ! -f "$ARCHIVE_FILE" ]; then
  echo "❌ файл не найден: $ARCHIVE_FILE" >&2
  exit 1
fi

if [ -z "${BACKUP_PASSPHRASE:-}" ]; then
  echo "❌ BACKUP_PASSPHRASE не задан — без него дамп не расшифровать." >&2
  exit 1
fi

# RESTORE_MONGODB_URI — отдельная переменная от BACKUP_MONGODB_URI (у которой
# read-only права, см. backup-mongo.sh): восстановление обязано писать, поэтому
# ей нужен другой, пишущий пользователь. MONGODB_URI — запасной вариант для
# локального прогона.
MONGO_URI="${RESTORE_MONGODB_URI:-${MONGODB_URI:-}}"
if [ -z "$MONGO_URI" ]; then
  echo "❌ не задан ни RESTORE_MONGODB_URI, ни MONGODB_URI." >&2
  exit 1
fi

if [ -z "$CONFIRM" ]; then
  echo "Ничего не сделано (dry-run). Без флага --yes восстановление не запускается."
  echo "Было бы выполнено:"
  echo "  1. расшифровать $ARCHIVE_FILE (openssl enc -d -aes-256-cbc -pbkdf2)"
  echo "  2. mongorestore --drop в базу из URI (переменная RESTORE_MONGODB_URI/MONGODB_URI)"
  echo "     --drop удаляет существующие коллекции перед восстановлением из дампа."
  echo "Повторить с --yes, когда цель проверена."
  exit 0
fi

# Наличие mongorestore проверяем только здесь, а не раньше: dry-run должен
# показывать план и без установленных инструментов (например, локально без
# mongodb-database-tools) — самому восстановлению они уже обязательны.
if ! command -v mongorestore >/dev/null 2>&1; then
  echo "❌ mongorestore не найден. Установить mongodb-database-tools (см. RUNBOOK §7)." >&2
  exit 1
fi

# --drop: восстановленная база должна точно совпадать с дампом, а не быть
# объединением старых и новых данных — иначе результат восстановления
# непредсказуем (RUNBOOK §7, «проверка восстановления»).
# mongorestore --archive восстанавливает в базу с ИСХОДНЫМ именем из дампа и
# не смотрит на имя базы в URI. Чтобы поднять дамп рядом (учения, CI-проверка,
# сравнение), имя переписывается через --nsFrom/--nsTo на базу из URI.
NS_ARGS=()
if [ -n "$FROM_DB" ]; then
  TARGET_DB="${MONGO_URI##*/}"
  TARGET_DB="${TARGET_DB%%\?*}"
  if [ -z "$TARGET_DB" ]; then
    echo "❌ --from-db задан, но в URI нет имени базы-получателя." >&2
    exit 1
  fi
  NS_ARGS=(--nsInclude="${FROM_DB}.*" --nsFrom="${FROM_DB}.*" --nsTo="${TARGET_DB}.*")
fi
if ! openssl enc -d -aes-256-cbc -pbkdf2 -salt -pass env:BACKUP_PASSPHRASE -in "$ARCHIVE_FILE" \
  | mongorestore --uri="$MONGO_URI" --archive --gzip --drop "${NS_ARGS[@]}"; then
  echo "❌ восстановление не удалось (расшифровка или mongorestore вернули ошибку)." >&2
  exit 1
fi

echo "✓ восстановление из $ARCHIVE_FILE завершено"
