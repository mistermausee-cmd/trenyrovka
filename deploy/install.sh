#!/usr/bin/env bash
set -Eeuo pipefail

REPO="${TRENYROVKA_REPO:-mistermausee-cmd/trenyrovka}"
BRANCH="${TRENYROVKA_BRANCH:-main}"
INSTALL_DIR="/opt/trenyrovka"
ENV_FILE="$INSTALL_DIR/.env"
TMP_DIR=""
SOURCE_DIR=""
PREVIOUS_DIR=""
PREUPDATE_BACKUP=""
FIRST_INSTALL=false
IS_UPDATE=false

if [[ -t 1 ]]; then
  BOLD='\033[1m'; GREEN='\033[32m'; YELLOW='\033[33m'; RED='\033[31m'; RESET='\033[0m'
else
  BOLD=''; GREEN=''; YELLOW=''; RED=''; RESET=''
fi

info() { printf "%b\n" "${GREEN}✓${RESET} $*"; }
warn() { printf "%b\n" "${YELLOW}!${RESET} $*"; }
die() { printf "%b\n" "${RED}Ошибка:${RESET} $*" >&2; exit 1; }
cleanup() { [[ -n "$TMP_DIR" && -d "$TMP_DIR" ]] && rm -rf "$TMP_DIR"; }
trap cleanup EXIT

prompt_tty() {
  local message="$1" default_value="${2:-}" value=""
  [[ -r /dev/tty ]] || die "Запустите установщик из интерактивного терминала."
  if [[ -n "$default_value" ]]; then printf "%s [%s]: " "$message" "$default_value" > /dev/tty; else printf "%s: " "$message" > /dev/tty; fi
  IFS= read -r value < /dev/tty || true
  printf '%s' "${value:-$default_value}"
}

env_value() {
  local key="$1"
  [[ -f "$ENV_FILE" ]] || return 0
  grep -m1 "^${key}=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- || true
}

require_root() {
  [[ "${EUID}" -eq 0 ]] || die "Установщик должен выполняться через sudo."
  [[ -f /etc/os-release ]] || die "Не удалось определить операционную систему."
  # shellcheck disable=SC1091
  source /etc/os-release
  [[ "${ID:-}" == "ubuntu" ]] || die "Поддерживается Ubuntu 24.04/26.04. Обнаружено: ${PRETTY_NAME:-неизвестно}."
  if [[ "${VERSION_ID:-}" != "24.04" && "${VERSION_ID:-}" != "26.04" ]]; then warn "Проверено на Ubuntu 24.04; обнаружено ${PRETTY_NAME:-другая версия}."; fi
}

install_prerequisites() {
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl openssl tar rsync >/dev/null
}

install_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    info "Docker и Compose уже установлены"
    systemctl enable --now docker >/dev/null 2>&1 || true
    return
  fi

  info "Устанавливаю Docker Engine из официального репозитория"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  local codename architecture
  codename="${UBUNTU_CODENAME:-${VERSION_CODENAME}}"
  architecture="$(dpkg --print-architecture)"
  cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${codename}
Components: stable
Architectures: ${architecture}
Signed-By: /etc/apt/keyrings/docker.asc
EOF
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null
  systemctl enable --now docker >/dev/null
  docker compose version >/dev/null || die "Docker Compose не запустился после установки."
  info "Docker установлен"
}

download_source() {
  TMP_DIR="$(mktemp -d)"
  SOURCE_DIR="$TMP_DIR/source"
  mkdir -p "$SOURCE_DIR"

  if [[ -n "${TRENYROVKA_SOURCE_DIR:-}" ]]; then
    [[ -f "$TRENYROVKA_SOURCE_DIR/package.json" ]] || die "TRENYROVKA_SOURCE_DIR не содержит package.json."
    rsync -a "$TRENYROVKA_SOURCE_DIR/" "$SOURCE_DIR/"
    info "Использую локальный исходный код"
  else
    local encoded_branch archive_url
    encoded_branch="${BRANCH//\//%2F}"
    archive_url="https://api.github.com/repos/${REPO}/tarball/${encoded_branch}"
    if [[ -n "${GITHUB_TOKEN:-}" ]]; then
      curl -fsSL --retry 3 -H "Authorization: Bearer ${GITHUB_TOKEN}" -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28" "$archive_url" -o "$TMP_DIR/source.tar.gz"
    else
      curl -fsSL --retry 3 -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28" "$archive_url" -o "$TMP_DIR/source.tar.gz" || die "Не удалось скачать репозиторий. Если он приватный, передайте GITHUB_TOKEN."
    fi
    tar -xzf "$TMP_DIR/source.tar.gz" --strip-components=1 -C "$SOURCE_DIR"
    info "Исходный код ${REPO}@${BRANCH} загружен"
  fi
  unset GITHUB_TOKEN || true
  [[ -f "$SOURCE_DIR/compose.yaml" && -f "$SOURCE_DIR/Dockerfile" ]] || die "В ветке нет файлов развёртывания."
}

snapshot_and_backup_existing() {
  [[ -f "$INSTALL_DIR/package.json" ]] || return
  IS_UPDATE=true
  PREVIOUS_DIR="$TMP_DIR/previous"
  mkdir -p "$PREVIOUS_DIR"
  rsync -a --exclude='.env' --exclude='data/' --exclude='backups/' "$INSTALL_DIR/" "$PREVIOUS_DIR/"
  [[ -f "$ENV_FILE" ]] && cp "$ENV_FILE" "$TMP_DIR/previous.env"

  if [[ -s "$INSTALL_DIR/data/trenyrovka.db" ]]; then
    info "Создаю обязательную копию базы перед обновлением"
    cd "$INSTALL_DIR"
    if docker compose ps --status running --services 2>/dev/null | grep -qx 'app'; then
      docker compose exec -T app node dist/server/server/cli-backup.js >/dev/null || die "Не удалось создать online backup; обновление остановлено."
    else
      docker compose run --rm --no-deps app node dist/server/server/cli-backup.js >/dev/null || die "Не удалось создать backup остановленного приложения; обновление остановлено."
    fi
    PREUPDATE_BACKUP="$(find "$INSTALL_DIR/backups" -maxdepth 1 -type f -name 'trenyrovka-*.db' -printf '%T@ %p\n' | sort -rn | head -n1 | cut -d' ' -f2-)"
    [[ -n "$PREUPDATE_BACKUP" && -s "$PREUPDATE_BACKUP" ]] || die "Резервная копия не прошла проверку."
    info "База защищена копией $(basename "$PREUPDATE_BACKUP")"
  fi
}

parse_site() {
  local input="$1"
  [[ -n "$input" ]] || die "Домен или IP обязателен."
  [[ "$input" =~ ^(https?://)?[A-Za-z0-9.-]+$ ]] || die "Допустим только домен или IPv4 без пути и порта."
  if [[ "$input" == http://* ]]; then SITE_ADDRESS_VALUE="$input"; COOKIE_SECURE_VALUE=false
  elif [[ "$input" == https://* ]]; then SITE_ADDRESS_VALUE="${input#https://}"; COOKIE_SECURE_VALUE=true
  elif [[ "$input" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ || "$input" == 'localhost' ]]; then SITE_ADDRESS_VALUE="http://${input}"; COOKIE_SECURE_VALUE=false
  else SITE_ADDRESS_VALUE="$input"; COOKIE_SECURE_VALUE=true
  fi
}

configure_app() {
  mkdir -p "$INSTALL_DIR/data" "$INSTALL_DIR/backups"
  chown -R 1000:1000 "$INSTALL_DIR/data" "$INSTALL_DIR/backups"
  chmod 700 "$INSTALL_DIR/data" "$INSTALL_DIR/backups"

  if [[ -f "$ENV_FILE" && "${TRENYROVKA_RECONFIGURE:-0}" != '1' ]]; then
    chmod 600 "$ENV_FILE"
    info "Существующий .env сохранён (для смены домена: TRENYROVKA_RECONFIGURE=1)"
    return
  fi

  local input setup_token
  if [[ -f "$ENV_FILE" ]]; then
    printf "\n%bИзменение адреса%b\n" "$BOLD" "$RESET"
    input="$(prompt_tty 'Новый домен или публичный IPv4' "$(env_value SITE_ADDRESS)")"
    parse_site "$input"
    setup_token="$(env_value SETUP_TOKEN)"
    [[ -n "$setup_token" ]] || die "В существующем .env отсутствует SETUP_TOKEN."
  else
    FIRST_INSTALL=true
    printf "\n%bПервоначальная настройка%b\n" "$BOLD" "$RESET"
    printf "Укажите домен с A-записью на Azure VM. Без домена можно ввести IPv4, но соединение будет без HTTPS.\n\n"
    input="$(prompt_tty 'Домен или публичный IPv4')"
    parse_site "$input"
    setup_token="$(openssl rand -hex 32)"
  fi

  umask 077
  cat > "$ENV_FILE" <<EOF
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
DATABASE_PATH=/data/trenyrovka.db
BACKUP_DIR=/backups
APP_TIMEZONE=Europe/Oslo
SETUP_TOKEN=${setup_token}
COOKIE_SECURE=${COOKIE_SECURE_VALUE}
TRUST_PROXY=true
LOG_LEVEL=info
SITE_ADDRESS=${SITE_ADDRESS_VALUE}
EOF
  chmod 600 "$ENV_FILE"
  info "Конфигурация сохранена с правами 0600"
}

sync_source() {
  mkdir -p "$INSTALL_DIR"
  if ! rsync -a --delete --exclude='.env' --exclude='data/' --exclude='backups/' "$SOURCE_DIR/" "$INSTALL_DIR/"; then
    restore_previous_source
    die "Не удалось синхронизировать новую версию."
  fi
  chmod 755 "$INSTALL_DIR/deploy/backup.sh" "$INSTALL_DIR/deploy/install.sh"
}

restore_previous_source() {
  [[ -n "$PREVIOUS_DIR" && -d "$PREVIOUS_DIR" ]] || return 0
  rsync -a --delete --exclude='.env' --exclude='data/' --exclude='backups/' "$PREVIOUS_DIR/" "$INSTALL_DIR/"
  [[ -f "$TMP_DIR/previous.env" ]] && cp "$TMP_DIR/previous.env" "$ENV_FILE" && chmod 600 "$ENV_FILE"
}

rollback_update() {
  [[ "$IS_UPDATE" == true ]] || return 1
  warn "Возвращаю предыдущую рабочую версию"
  cd "$INSTALL_DIR"
  docker compose stop app >/dev/null 2>&1 || true
  if [[ -n "$PREUPDATE_BACKUP" && -s "$PREUPDATE_BACKUP" ]]; then
    cp "$PREUPDATE_BACKUP" "$INSTALL_DIR/data/trenyrovka.db"
    rm -f "$INSTALL_DIR/data/trenyrovka.db-wal" "$INSTALL_DIR/data/trenyrovka.db-shm"
    chown 1000:1000 "$INSTALL_DIR/data/trenyrovka.db"
  fi
  restore_previous_source
  cd "$INSTALL_DIR"
  docker compose build app >/dev/null 2>&1 || return 1
  docker compose up -d --remove-orphans --force-recreate app caddy >/dev/null 2>&1 || return 1
  info "Предыдущая версия восстановлена"
  return 0
}

wait_for_health() {
  local ready=false
  for _ in $(seq 1 40); do
    if docker compose exec -T app node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1 \
      && docker compose exec -T caddy wget -q -O /dev/null http://127.0.0.1:8080/api/health >/dev/null 2>&1; then
      ready=true
      break
    fi
    sleep 2
  done
  [[ "$ready" == true ]]
}

start_app() {
  cd "$INSTALL_DIR"
  if ! docker compose config --quiet || ! docker compose pull --quiet caddy; then
    restore_previous_source
    die "Конфигурация Compose или загрузка Caddy завершилась ошибкой; предыдущий код сохранён."
  fi
  if ! docker compose build --pull app; then
    restore_previous_source
    die "Новая версия не собралась; работающий контейнер не заменён."
  fi
  if ! docker compose up -d --remove-orphans --force-recreate app caddy || ! wait_for_health; then
    docker compose logs --tail 80 || true
    rollback_update || true
    die "Новая версия не прошла health check; выполнен откат, если существовала предыдущая установка."
  fi
  info "Приложение запущено и прошло health check"
}

install_backup_timer() {
  cp "$INSTALL_DIR/deploy/trenyrovka-backup.service" /etc/systemd/system/trenyrovka-backup.service
  cp "$INSTALL_DIR/deploy/trenyrovka-backup.timer" /etc/systemd/system/trenyrovka-backup.timer
  systemctl daemon-reload
  systemctl enable --now trenyrovka-backup.timer >/dev/null
  info "Ежедневная резервная копия включена (03:15 Europe/Oslo)"
}

open_firewall_if_needed() {
  if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q '^Status: active'; then
    ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; ufw allow 443/udp >/dev/null
    info "Порты 80/443 разрешены в UFW"
  fi
}

print_result() {
  local site setup_token
  site="$(env_value SITE_ADDRESS)"; setup_token="$(env_value SETUP_TOKEN)"
  if [[ "$site" != http://* && "$site" != https://* ]]; then site="https://${site}"; fi
  printf "\n%bГотово%b\n" "$BOLD" "$RESET"
  printf "Сайт: %b%s%b\n" "$GREEN" "$site" "$RESET"
  if [[ "$FIRST_INSTALL" == true ]]; then printf "Setup-токен: %b%s%b\nОткройте сайт, вставьте токен и создайте пароль.\n" "$BOLD" "$setup_token" "$RESET"; fi
  printf "\nВажно для Azure: в Network Security Group должны быть входящие TCP 80 и 443.\n"
  if [[ "$site" == http://* ]]; then warn "HTTP не защищает пароль в публичной сети. Подключите домен и повторите с TRENYROVKA_RECONFIGURE=1."; else printf "Caddy автоматически выпустит HTTPS-сертификат, когда DNS и порты доступны.\n"; fi
  printf "\nКоманды:\n  cd %s && sudo docker compose ps\n  cd %s && sudo docker compose logs -f --tail=100\n  sudo systemctl list-timers trenyrovka-backup.timer\n" "$INSTALL_DIR" "$INSTALL_DIR"
}

require_root
install_prerequisites
install_docker
download_source
snapshot_and_backup_existing
configure_app
sync_source
start_app
install_backup_timer
open_firewall_if_needed
print_result
