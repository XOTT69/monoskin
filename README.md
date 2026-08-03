# MONOSKIN

Внутрішній каталог скінів карток mono для операторів. У каталозі зібрані доступні, промо та архівні скіни з короткими умовами видачі й підказками для роботи з Apple Pay та Google Pay.

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
