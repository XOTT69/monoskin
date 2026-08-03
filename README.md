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

## Заявки на скіни в Telegram

Форма «Запропонувати скін» працює через `telegram-worker/`: GitHub Pages залишається хостингом сайту, а секрети Telegram зберігаються тільки у Cloudflare Worker. Форма приймає назву, категорію, опис, посилання та фото до 8 МБ; її також захищає Cloudflare Turnstile.

Одноразове налаштування власником:

1. Створіть бота через [@BotFather](https://t.me/BotFather), напишіть йому повідомлення та визначте ID приватного чату, куди мають приходити заявки.
2. У Cloudflare створіть Turnstile widget для hostname `xott69.github.io`; збережіть **Site key** і **Secret key**.
3. У терміналі виконайте:

   ```bash
   cd telegram-worker
   npm install
   npx wrangler login
   cp .dev.vars.example .secrets
   ```

   Відкрийте `.secrets`, замініть три значення на токен бота, ID чату й Secret key Turnstile, а потім виконайте:

   ```bash
   npx wrangler deploy --secrets-file .secrets
   ```

   Після першої публікації файл `.secrets` можна прибрати з комп’ютера. Для подальшої заміни окремого значення використовуйте `npx wrangler secret put НАЗВА_СЕКРЕТУ`.

   Worker виведе URL формату `https://monoskin-telegram.<account>.workers.dev`; для форми використовується адреса з `/submit` у кінці.
4. У GitHub відкрийте **Settings → Secrets and variables → Actions → Variables** і створіть дві змінні:
   - `NEXT_PUBLIC_SUBMISSION_API_URL` — URL Worker із `/submit`;
   - `NEXT_PUBLIC_TURNSTILE_SITE_KEY` — публічний Site key із Turnstile.
5. Запустіть workflow **Deploy MONOSKIN to GitHub Pages** ще раз або зробіть новий push у `main`.

Ніколи не додавайте токен Telegram, ID чату або секрет Turnstile у GitHub Variables, код сайту чи репозиторій: ці значення вводяться лише командами `wrangler secret put`.
