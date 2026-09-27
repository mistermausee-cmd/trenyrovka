# Trenyrovka

Персональный mobile-first трекер 12-недельной домашней программы. Он знает дату и время в Норвегии, показывает следующую тренировку A/B, ведёт по одному упражнению, объясняет технику, открывает короткие видео и сохраняет каждый подход для последующего анализа.

## Что уже есть

- локальная дата и живые часы `Europe/Oslo` с учётом летнего времени;
- программа A/B на 12 недель: адаптация → объём → закрепление;
- автоматические варианты без оборудования и с длинными резинками;
- 19 упражнений с русскими шагами, подсказками, ошибками, безопасными упрощениями и прогрессиями;
- схемы стартовой/конечной позиции и короткие видеогайды внутри сайта;
- check-in сна и готовности, счётчик повторов/секунд, вес рюкзака, RIR и таймер отдыха;
- журнал тренировок, замеры, графики и соблюдение плана;
- экспорт Markdown для тренера и полный JSON;
- приватная однопользовательская авторизация без сторонней аналитики;
- согласованные SQLite-бэкапы вручную и ежедневно;
- Docker Compose + Caddy с автоматическим HTTPS.

## Быстрая установка на Ubuntu 24.04

Сервер: Ubuntu 24.04, минимум 2 GB RAM и 10 GB свободного места. Конфигурации Azure 4 vCPU / 16 GB / 128 GB более чем достаточно.

### 1. Подготовьте Azure

В Azure Portal откройте **VM → Networking → Network settings → Inbound port rules** и разрешите входящие TCP `80` и `443`. SSH `22` лучше ограничить своим IP. Публичный IPv4 VM должен быть статическим.

### 2. Автоматическая установка без домена

После публикации репозитория вставьте один блок. Он автоматически получит публичный IPv4 через Azure Instance Metadata Service (с резервной проверкой внешнего адреса), не задаст вопросов и включит доверенный HTTPS прямо для IP:

```bash
sudo apt-get update -qq && \
sudo apt-get install -y -qq curl ca-certificates && \
bash -o pipefail -c '
  curl -fsSL \
    -H "Accept: application/vnd.github.raw+json" \
    "https://api.github.com/repos/mistermausee-cmd/trenyrovka/contents/deploy/install.sh?ref=feat%2Fpersonal-training-tracker" \
  | sudo env \
      TRENYROVKA_BRANCH="feat/personal-training-tracker" \
      TRENYROVKA_AUTO_IP=1 \
      TRENYROVKA_RECONFIGURE=1 \
      bash
'
```

Установщик:

1. установит Docker Engine и Compose из официального apt-репозитория;
2. скачает приложение в `/opt/trenyrovka`;
3. автоматически определит публичный IPv4;
4. настроит Caddy 2.11 с короткоживущим IP-сертификатом Let's Encrypt;
5. создаст случайный setup-токен и покажет его в конце;
6. соберёт контейнеры, проверит приложение и reverse proxy, включит ежедневные копии.

Откройте показанный URL вида `https://203.0.113.10`, вставьте setup-токен и создайте пароль длиной не менее 10 символов. Первый сертификат может выпускаться несколько десятков секунд. Let's Encrypt выдаёт IP-сертификат примерно на 6 дней, а Caddy автоматически обновляет его задолго до истечения.

Если Azure metadata возвращает не тот адрес (например, VM работает через отдельный NAT Gateway), передайте IP явно:

```bash
bash -o pipefail -c '
  curl -fsSL \
    -H "Accept: application/vnd.github.raw+json" \
    "https://api.github.com/repos/mistermausee-cmd/trenyrovka/contents/deploy/install.sh?ref=feat%2Fpersonal-training-tracker" \
  | sudo env \
      TRENYROVKA_BRANCH="feat/personal-training-tracker" \
      TRENYROVKA_SITE_ADDRESS="203.0.113.10" \
      TRENYROVKA_RECONFIGURE=1 \
      bash
'
```

После переноса кода в `main` переменная `TRENYROVKA_BRANCH` не нужна.

## Обновление

Повторно выполните установочную команду. `.env`, база `data/trenyrovka.db`, резервные копии и Docker volumes сохраняются. Перед обновлением можно создать ручную копию:

```bash
cd /opt/trenyrovka
sudo docker compose exec -T app node dist/server/server/cli-backup.js
```

## Операционные команды

```bash
cd /opt/trenyrovka
sudo docker compose ps
sudo docker compose logs -f --tail=100
sudo docker compose restart
sudo systemctl status trenyrovka-backup.timer
sudo systemctl start trenyrovka-backup.service
```

Данные:

- `/opt/trenyrovka/data/trenyrovka.db` — рабочая SQLite-база;
- `/opt/trenyrovka/backups/` — до 14 последних согласованных копий;
- `/opt/trenyrovka/.env` — setup-токен и параметры, режим `0600`.

Для восстановления сначала остановите приложение и сохраните текущую БД:

```bash
cd /opt/trenyrovka
sudo docker compose stop app
sudo cp data/trenyrovka.db data/trenyrovka.db.before-restore
sudo cp backups/ИМЯ-КОПИИ.db data/trenyrovka.db
sudo chown 1000:1000 data/trenyrovka.db
sudo docker compose start app
```

## Локальная разработка

Требуются Node.js 22.12+ и npm.

```bash
cp .env.example .env
# замените SETUP_TOKEN на случайную строку длиной 24+ символа
npm ci
npm run dev
```

Откройте `http://localhost:5173`. Production-проверки:

```bash
npm run typecheck
npm run build
npm start
```

## Безопасность

- пароль хэшируется через `scrypt` с уникальной солью;
- в БД хранится только SHA-256 хэш случайного session-токена;
- cookie: HttpOnly, SameSite=Strict и Secure при HTTPS;
- изменяющие запросы требуют CSRF-токен и same-origin проверку;
- логин ограничен по частоте;
- CSP разрешает видеокадры только с `youtube-nocookie.com`;
- приложение работает непривилегированным пользователем и с read-only root filesystem;
- экспорт для тренера исключает пароли, сессии и setup-токен.

При установке на публичный статический IPv4 Caddy использует общедоступный короткоживущий IP-сертификат Let's Encrypt. Порты `80` и `443` должны оставаться доступными для автоматического перевыпуска; не используйте динамический адрес, который может смениться.

## Источники решений

- [ACSM Position Stand 2026](https://doi.org/10.1249/mss.0000000000003897) — основа структуры силовой программы.
- [WHO physical activity guidance](https://www.who.int/news-room/fact-sheets/detail/physical-activity) — общие ориентиры активности.
- [ACE Exercise Library](https://www.acefitness.org/resources/everyone/exercise-library/) и [NHS Strength Exercises](https://www.nhs.uk/live-well/exercise/strength-exercises/) — проверка техники и безопасных вариантов.
- [Docker Engine for Ubuntu](https://docs.docker.com/engine/install/ubuntu/) — официальный apt-способ установки.
- [Let's Encrypt: IP Address Certificates GA](https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability) — доверенные IPv4/IPv6-сертификаты и обязательный профиль `shortlived`.
- [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https) — автоматическая выдача, обновление и постоянное хранилище сертификатов.

## Медицинская оговорка

Приложение является тренировочным дневником, а не медицинским устройством. Острая боль, боль в груди, обморочное состояние или необычная одышка — повод немедленно остановить занятие; при сохраняющихся симптомах обратитесь к врачу.
