# SoupPack / SOUP PUCK

CRM + клиентский каталог для продажи супов в формате шайбы 350 г.
Монорепо из трёх независимых приложений.

```
SoupPack/
├── backend/   — Strapi 5 (TypeScript)        http://localhost:1337
├── client/    — клиентский каталог, Vue 3    http://localhost:5173
└── admin/     — админ-панель, Vue 3          http://localhost:5174/admin/
```

## Стек

- **Backend**: Strapi 5 + TypeScript + SQLite (dev)
- **Frontend**: Vue 3 (Composition API, `<script setup>`) + TypeScript + Vite
- **UI**: PrimeVue 4 + Tailwind CSS v4 (CSS-first config)
- **State**: Pinia
- **HTTP**: Axios

## Запуск (dev)

### 1. Backend

```bash
cd backend
npm run develop
```

Первый запуск откроет `http://localhost:1337/admin` — создайте учётную запись суперадмина.
Затем **Settings → API Tokens → Create new API Token** → скопируйте токен.

### 2. Client

```bash
cd client
cp .env.example .env
# впишите VITE_API_URL=http://localhost:1337/api и VITE_API_TOKEN=<ваш токен>
npm run dev
```

Открывается на `http://localhost:5173`.

### 3. Admin

```bash
cd admin
cp .env.example .env
npm run dev
```

Открывается на `http://localhost:5174/admin/`.

## Что уже реализовано

### Клиентский каталог
- Главная (hero, фичи, подборка хитов, готовые наборы)
- Каталог с фильтром по категориям
- Страница продукта с составом и способами разогрева
- Корзина с localStorage persistence
- Оформление заказа: имя, телефон, район, адрес, способ оплаты
- Личный кабинет: профиль + история заказов (хранится локально до бэкенда)
- Запоминание клиента по телефону

### Админ-панель
- Дашборд: KPI (заказы, выручка, средний чек, отмены), топ-продукты, последние заказы
- Баннеры: CRUD карусели главной
- Каталог: категории, продукты (список + редактор карточки с продаваемостью за период)
- Конструктор заказов: наборы с составом и скидкой, флаг «показывать в каталоге»
- Заказы: таблица + фильтр по статусу, детальный просмотр чека, причина отмены
- Клиенты: автогенерация из заказов, статистика по каждому
- Сотрудники: роли (главный / дежурный / обычный), привязка к району+MKO, персональный ключ
- Локализация: Районы и MKO (с привязкой MKO → Район)

### Strapi content-types
- `category`, `product`, `district`, `mko`, `banner`, `order-set`
- `client`, `employee`, `order` + компоненты `order.line` / `order.set-item`
- `telegram-session` — корзина и шаг оформления Telegram-бота

### Telegram-бот магазина
- Каталог по категориям (товары по 5 с фото, ценой и составом, кнопка «Ещё»), корзина, оформление заказа
- Форма: имя, телефон, обязательная локация, адрес (улица, дом, квартира)
- Заказы попадают в общий список с источником `telegram` («через Telegram»)
- Работает внутри Strapi; включается в админке «SLA и Telegram» (тот же Bot token, что для уведомлений)
- Подробности: [`docs/telegram-bot.md`](docs/telegram-bot.md)

## Дизайн-система

Палитра взята из брифа:

| Токен        | HEX       | Назначение                          |
|--------------|-----------|-------------------------------------|
| `ink-900`    | `#0a0a0a` | фон тёмной шапки, кнопки            |
| `cream-50`   | `#faf5ec` | фон клиентского каталога            |
| `cream-200`  | `#ead5ad` | бордеры, нейтральные бейджи         |
| `tomato-500` | `#d14836` | primary (кнопки, акценты, лого «P») |
| `olive-500`  | `#6b7a3f` | positive-состояния, набор заказов   |
| `saffron-300`| `#e8b824` | «ХИТ», статусы ожидания             |

Шрифты: **Montserrat** (display) + **Inter** (body) — подключены через Google Fonts.

Токены объявлены в `src/assets/style.css` через `@theme` (Tailwind v4) и
дублируются как цвета в кастомном PrimeVue preset (`src/theme/preset.ts`).

## Что ещё предстоит сделать

- **Отдельное приложение сотрудника**: авторизация по персональному ключу (`employee.personalKey`),
  фильтрация заказов по его району/MKO/роли. Можно реализовать как ещё один Vue-пакет `employee-app/` в этом же монорепо.
- **Замена моков на запросы к Strapi**: во всех `stores/catalog.ts`, `admin/src/data/mock.ts`.
  Заготовки `services/api.ts` уже есть; остаётся вызвать `api.get('/products?populate=*')` и т.п.
- **Загрузка изображений**: пока в карточке продукта — заглушка; подключить к Strapi `/upload` endpoint.
- **Авторизация админа**: сейчас LoginPage просто редиректит; завести через `users-permissions` плагин Strapi.

## Структура кода (клиент/админка)

Обе фронтенд-апы следуют одинаковой схеме:

```
src/
├── assets/style.css      — Tailwind v4 @theme + типографика
├── theme/preset.ts       — PrimeVue preset (brand colors)
├── services/api.ts       — axios-инстанс
├── stores/*.ts           — Pinia (client-only)
├── layouts/              — обёртки роутера
├── components/           — переиспользуемое
├── pages/                — страницы, подгружаются ленивыми импортами в router
├── types/                — глобальные TS-типы (client)
├── data/mock.ts          — моки до подключения Strapi (admin)
└── main.ts / App.vue / router/
```

## Лицензия

Internal.
