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

Публічна форма приймає назву, категорію, опис, посилання та фото до 8 МБ; її також захищає Cloudflare Turnstile.

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

   Worker виведе URL формату `https://monoskin-telegram.<account>.workers.dev`. Для бота задай webhook (підстав URL Worker і введи значення лише у свій термінал):

   ```bash
   read -s MONOSKIN_BOT_TOKEN
   read -s MONOSKIN_WEBHOOK_SECRET
   curl --fail --request POST "https://api.telegram.org/bot${MONOSKIN_BOT_TOKEN}/setWebhook" \
     --data-urlencode "url=https://YOUR-WORKER.workers.dev/telegram/webhook" \
     --data-urlencode "secret_token=${MONOSKIN_WEBHOOK_SECRET}" \
     --data-urlencode 'allowed_updates=["message","callback_query"]'
   unset MONOSKIN_BOT_TOKEN MONOSKIN_WEBHOOK_SECRET
   ```

   У відповідь має прийти `"ok":true`. Потім відкрий приватний чат із ботом і надішли `/start`.

5. У GitHub відкрийте **Settings → Secrets and variables → Actions → Variables** і створіть дві змінні:
   - `NEXT_PUBLIC_SUBMISSION_API_URL` — URL Worker із `/submit`;
   - `NEXT_PUBLIC_TURNSTILE_SITE_KEY` — публічний Site key із Turnstile.
6. Запустіть workflow **Deploy MONOSKIN to GitHub Pages** ще раз або зробіть новий push у `main`.

Ніколи не додавайте токен Telegram, GitHub token, ID чату, webhook secret або секрет Turnstile у GitHub Variables, код сайту чи репозиторій: ці значення вводяться лише командами `wrangler secret put`.
