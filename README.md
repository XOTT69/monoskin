# MONOSKIN

Відкритий каталог скінів карток mono для Apple Pay та Google Pay. У каталозі зібрані доступні та недоступні скіни з короткими умовами отримання.

## Запуск локально

```bash
npm install
BASE_PATH=/monoskin npm run dev
```

## Публікація

Після кожного push у гілку `main` GitHub Actions збирає статичну версію та публікує її в GitHub Pages.

## Джерело каталогу

Початкові записи та зображення каталогу адаптовано з відкритого проєкту [toppi-me/monoskins](https://github.com/toppi-me/monoskins), що поширюється за MIT License.

## Адмінка

Адмінка доступна за адресою `/admin/` і працює лише для власника репозиторію. Одноразове налаштування:

1. У GitHub відкрийте **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Виберіть репозиторій `XOTT69/monoskin` і в **Repository permissions** надайте лише **Contents: Read and write**.
3. Відкрийте `https://xott69.github.io/monoskin/admin/`, вставте token і працюйте з каталогом.

Token не записується у репозиторій і не зберігається сайтом: він існує лише в пам’яті відкритої вкладки. Його можна відкликати у GitHub у будь-який момент.

## Заявки та швидке додавання через Telegram

Форма «Запропонувати скін» і приватний Telegram-бот працюють через `telegram-worker/`: GitHub Pages залишається хостингом сайту, а секрети Telegram зберігаються тільки у Cloudflare Worker.

У приватному чаті з ботом власник пише `/start` або натискає «Додати скін», надсилає до шести фото й відповідає на короткі запитання. Перед публікацією бот показує підсумок. Кнопка «Опублікувати» одним комітом додає зображення та запис у `data/skins.json`; GitHub Pages оновлює каталог автоматично. Чернетка зберігається 24 години й доступна лише для `TELEGRAM_CHAT_ID`.

### Редактори через Telegram

Редактори не отримують GitHub token або доступ до адмінки. Вони додають скін у приватному чаті з ботом і натискають «Надіслати на перевірку». Бот передає власнику всі фото та деталі з кнопками «Опублікувати» / «Відхилити»; тільки власник може опублікувати скін.

Бот також має меню «Моя чернетка», «Чернетки», «Останні додані» та «Проблемні URL». Раз на тиждень він перевіряє всі посилання на отримання, надсилає власнику короткий звіт у Telegram і оновлює в каталозі дату та результат перевірки. Він не змінює статуси скінів і не публікує нові скіни самостійно.

Щоб надати доступ редактору:

1. Попросіть його відкрити приватний чат із ботом і надіслати `/id`.
2. Він перешле вам число з відповіді бота.
3. У Cloudflare відкрийте **Workers & Pages → monoskin-telegram → Settings → Variables and Secrets** і додайте або оновіть Secret `TELEGRAM_EDITOR_CHAT_IDS`. Вкажіть ID редакторів через кому, наприклад: `123456789,987654321`.
4. Натисніть **Deploy**. Щоб забрати доступ — видаліть потрібний ID та знову натисніть **Deploy**.

Публічна форма приймає назву, категорію, опис, посилання та фото до 8 МБ; її також захищає Cloudflare Turnstile.

### Cloudflare Web Analytics

Щоб бачити відвідування без банерів cookie та без передачі персональних даних у сторонні сервіси, створіть сайт у [Cloudflare Web Analytics](https://developers.cloudflare.com/web-analytics/get-started/) і додайте його token у змінну збірки `NEXT_PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN`.

- Для **Cloudflare Pages**: **Workers & Pages → monoskin → Settings → Variables and Secrets → Production**.
- Для **GitHub Pages**: **Repository → Settings → Secrets and variables → Actions → Variables**.

Після наступного деплою скрипт аналітики підключиться автоматично. Якщо змінну не додавати, жодна аналітика не завантажується.

Одноразове налаштування власником:

1. Створіть бота через [@BotFather](https://t.me/BotFather), напишіть йому повідомлення та визначте ID приватного чату, куди мають приходити заявки.
2. У Cloudflare створіть Turnstile widget для hostname `xott69.github.io`; збережіть **Site key** і **Secret key**.
3. Створіть окремий fine-grained GitHub token для `XOTT69/monoskin` з єдиним дозволом **Contents: Read and write**. Він потрібен тільки Worker-боту, щоб додавати схвалені скіни. Не використовуйте token з адмінки й не надсилайте його в чат.

4. У терміналі виконайте:

   ```bash
   cd telegram-worker
   npm install
   npx wrangler login
   cp .dev.vars.example .dev.vars
   ```

   Для локальної перевірки можна заповнити `.dev.vars`, але не додавайте цей файл у Git. У production задай секрети через Cloudflare:

   ```bash
   npx wrangler secret put GITHUB_TOKEN
   npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
   npx wrangler deploy --config wrangler.jsonc
   ```

   `GITHUB_TOKEN` — fine-grained token із попереднього пункту. Для `TELEGRAM_WEBHOOK_SECRET` створи окремий довгий випадковий рядок і збережи його: він знадобиться лише в наступній команді. Існуючі `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` та `TURNSTILE_SECRET_KEY` залишаються в Worker.

   Worker виведе URL формату `https://monoskin-telegram.<account>.workers.dev`. Відкрий у браузері адресу з `/telegram/connect` у кінці, встав `TELEGRAM_WEBHOOK_SECRET` і натисни «Підключити бота». Токен Telegram на цій сторінці не потрібен. Потім відкрий приватний чат із ботом і надішли `/start`.

5. У GitHub відкрийте **Settings → Secrets and variables → Actions → Variables** і створіть дві змінні:
   - `NEXT_PUBLIC_SUBMISSION_API_URL` — URL Worker із `/submit`;
   - `NEXT_PUBLIC_TURNSTILE_SITE_KEY` — публічний Site key із Turnstile.
6. Запустіть workflow **Deploy MONOSKIN to GitHub Pages** ще раз або зробіть новий push у `main`.

Ніколи не додавайте токен Telegram, GitHub token, ID чату, webhook secret або секрет Turnstile у GitHub Variables, код сайту чи репозиторій: ці значення вводяться лише командами `wrangler secret put`.
