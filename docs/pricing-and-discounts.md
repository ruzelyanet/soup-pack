# SoupPack — Цены и скидки

Техническое задание для Claude Code. Описывает вынос цен из товара в отдельную сущность и единый механизм скидок, которые привязываются к товару, категории, набору или всему чеку.

> Перед началом работы прочитай этот файл целиком, затем `docs/requests-orders-transactions.md` (общие правила проекта: деньги, история, безопасность) и текущий код, перечисленный в разделе 1. Если код расходится с описанием здесь — ориентируйся на код и отметь расхождение в итоговом отчёте.

---

## Глоссарий

- **Цена (price)** — базовая стоимость товара на период.
- **Скидка (discount)** — правило уменьшения цены. Сущность `api::discount.discount` (бывшая `promotion`).
- **Цель скидки (discount-target)** — на что действует скидка.
- **Применённая скидка (order-discount)** — неизменяемый факт в заказе.
- **Промокод (coupon)** — позже; способ получить доступ к скидке.
- **Акция (campaign)** — следующая фаза; маркетинговая кампания, может содержать скидки. В текущих данных термин «акция» = «скидка» (историческое название).

Имя `promotion` в новом коде не используем. В БД и API остались deprecated-алиасы: таблицы были переименованы миграцией `20261102000000-rename-promotions-to-discounts.js`, маршруты `/promotions*` работают как редиректы/алиасы один релиз, снимки `order.items[].discounts[].promotionId` в старых заказах читаются через `discountId ?? promotionId`.

---

## 0. Ключевые принципы

1. **Товар ≠ цена ≠ скидка.** Товар отвечает на вопрос «что это». Цена — «сколько стоит, где и когда». Скидка — «временное правило, уменьшающее цену при условиях». Это три разные сущности.
2. **Правило отдельно от факта применения.** Скидка (`discount`) — редактируемое правило. Применённая скидка в заказе — неизменяемый снимок (сколько, на какую строку, по какой версии скидки). Изменение или архивация скидки никогда не меняет старые заказы.
3. **Считает только сервер.** Цены и скидки вычисляет один сервис на бэкенде. Клиент и админка показывают то, что вернул сервер, и не дублируют формулы. Цифры из тела запроса не принимаются на веру.
4. **Деньги — целые сумы (UZS)**, тип `integer`. Никаких float в расчётах.
5. **Ничего не перезаписываем задним числом.** Новая цена — новая строка с датой начала. Изменённая активная скидка — новая версия.
6. **Скидка в заказе хранится построчно.** Скидка на весь чек распределяется по строкам (нужно для фискального чека, возвратов отдельных позиций и отчётов).

---

## 1. Текущее состояние (что есть в коде)

| Где | Что сейчас |
|---|---|
| `api::product` | `price` (decimal), `oldPrice`, `discountPercent`, `discountName`, `discountFrom`, `discountTo` — цена и скидка прямо в товаре |
| `api::order-set` | `totalPrice`, `discountPrice`, `discountPercent`, `discountName`, `discountFrom`, `discountTo` — цена и скидка набора хранятся руками |
| `api::cart-discount` (single type) + `discount.tier` | скидка на чек по порогам суммы, только для `courier_now` |
| `order.line` (component) | `price`, `qty`, `setDiscountPercent`, `fromSetName` |
| `api::order` | `subtotal`, `cartDiscountPercent`, `cartDiscountAmount`, `total` (decimal) |
| `backend/src/api/order/services/order.ts` | `computeItems`, `computeCartDiscount`, `pickTier`, `preview`, `buildAndCreate` |
| `client/src/stores/cart.ts`, `client/src/services/api.ts` (`finalPrice`, `hasDiscount`), `CheckoutPage.vue`, `CartPage.vue`, `ProductCard.vue`, `ProductPage.vue`, `DiscountsPage.vue`, `HomePage.vue`, `SetPage.vue` | фронт сам считает скидки товара, набора и чека |
| `admin/src/pages/catalog/ProductEditor.vue`, `constructor/OrderSets.vue`, `CartDiscount.vue` | редактирование скидок в карточке товара / набора / на чек |

### 1.1. Известные ошибки, которые закрывает эта задача

1. **Скидка набора не применяется сервером.** `cart.ts → addSetLines()` снижает цену строки на `set.discountPercent`, а `order.service.computeItems()` берёт цену из БД только с учётом скидки товара. Клиент видит на чекауте одну сумму, а заказ создаётся с другой (больше). `setDiscountPercent`/`fromSetName` сохраняются в строку, но на цену не влияют.
2. **Даты скидки товара игнорируются.** `discountFrom`/`discountTo` не проверяются ни на сервере (`computeItems`), ни на клиенте (`finalPrice`, `ProductCard`): истёкшая скидка продолжает действовать, пока её не уберут руками.
3. **Формулы скидок продублированы** в 6+ местах фронта и на сервере и уже разошлись.
4. **Цена набора (`totalPrice`) хранится руками** и не обновляется при изменении цен товаров.
5. **Денежные поля — `decimal`**, расчёты местами без округления.

Пункты 1 и 2 — реальная потеря денег / недовольство клиентов. Их чинит фаза 1 (раньше полной переделки).

---

## 2. Модель данных

```
product ──< price >── price-list (позже)
   │
   ├──< discount-target >── discount ──< discount (предыдущие версии)
   │          │    │
category ─────┘    └── order-set
                                        order ──< order-discount >── discount
                                          │
                                       items (order.line + снимок скидок)
```

### 2.1. Content-type `price`

Цена товара с периодом действия. Старые цены не удаляются и не правятся.

| Поле | Тип | Примечание |
|---|---|---|
| `product` | relation manyToOne → `product`, required | `inversedBy: prices` |
| `amount` | integer, required, > 0 | сумы |
| `validFrom` | datetime, required | с какого момента действует |
| `validTo` | datetime, nullable | до какого момента (не включительно); `null` — бессрочно |
| `priceList` | relation manyToOne → `price-list`, nullable | **не делать в этой итерации**, оставить место; `null` = розница |
| `comment` | string | «повышение поставщика» и т.п. |
| `createdByEmployee` | relation → `employee` | кто изменил |

Правила:

- Для одного товара (и одного прайс-листа) интервалы `[validFrom, validTo)` не пересекаются. Проверка в сервисе `pricing.setPrice()`, при нарушении — `PRICE_PERIOD_OVERLAP`.
- Изменение цены = `pricing.setPrice(productId, amount, validFrom = now | дата в будущем)`: у текущей открытой строки ставится `validTo = validFrom` новой, создаётся новая строка. Всё в одной DB-транзакции.
- Плановая цена (в будущем) создаётся так же; до наступления даты действует старая.
- Удалять строки цен нельзя. Отменить ещё не наступившую плановую цену можно (`manager`): строка удаляется только если `validFrom > now`, у предыдущей восстанавливается `validTo`.
- `draftAndPublish: false`.

`product.price` после миграции **удаляется** из схемы (фаза 4). До этого он остаётся, но только для чтения и обновляется сервисом как кеш текущей цены, чтобы не сломать старый код в переходный период.

### 2.2. Content-type `price-list` (только задел)

Не реализуем сейчас. Если владелец подтвердит отдельные цены для магазинов (`client.kind = shop`, см. открытый вопрос 1 в `requests-orders-transactions.md`), добавляется `price-list` (`name`, `code`, `priority`, `clientKind`), а `pricing.resolveBasePrice` выбирает строку `price` по прайс-листу клиента с fallback на розницу. Модель выше это уже допускает.

### 2.3. Content-type `discount`

Скидка — правило уменьшения цены. Не путать с ценой: «оптовая цена для магазинов» — это прайс-лист, а не скидка.

| Поле | Тип | Примечание |
|---|---|---|
| `name` | string, required | внутреннее название |
| `publicLabel` | string | что видит клиент: «−20% на борщ до пятницы» |
| `status` | enum `draft\|active\|paused\|archived` | в расчёте участвуют только `active` |
| `level` | enum `line\|set\|order` | на что действует: строки товаров / набор целиком / весь чек |
| `benefitType` | enum `percent\|fixed_amount\|fixed_price` | см. 2.5 |
| `benefitValue` | integer, required | процент (1–99) или сумма в сумах |
| `maxDiscountAmount` | integer, nullable | потолок скидки на заказ по этой скидке |
| `startsAt`, `endsAt` | datetime, nullable | период; `null` = без ограничения |
| `conditions` | json | см. 2.6 |
| `priority` | integer, default 100 | меньше — применяется раньше |
| `stackable` | boolean, default true | можно ли сочетать с другими скидками того же уровня на той же строке |
| `exclusiveGroup` | string, nullable | из скидок одной группы к строке/чеку применяется только одна — самая выгодная клиенту |
| `showInCatalog` | boolean, default true | показывать бейдж/зачёркнутую цену и страницу «Скидки» |
| `version` | integer, default 1 | |
| `previousVersion` | relation oneToOne → `discount` | цепочка версий |
| `targets` | relation oneToMany → `discount-target` | |
| `createdByEmployee` | relation → `employee` | |

`draftAndPublish: false` — статус управляется полем `status`, а не публикацией Strapi.

**Версионирование.** Если скидка хоть раз применена в заказе (есть `order-discount`), то изменение `benefitType`, `benefitValue`, `level`, `conditions`, `targets` создаёт новую запись с `version + 1` и `previousVersion`, а старая уходит в `archived`. Без применений — правится на месте. Поля `name`, `publicLabel`, `status`, `endsAt`, `showInCatalog` правятся всегда на месте. Реализуется в контроллере `discount.staffUpdate()`, фронт об этом не думает.

### 2.4. Content-type `discount-target`

К чему привязана скидка. Отдельная коллекция, а **не repeatable component**: по ней нужно искать «какие скидки действуют на товар X», а id компонентов в Strapi 5 пересоздаются при каждом обновлении.

| Поле | Тип | Примечание |
|---|---|---|
| `discount` | relation manyToOne → `discount`, required | |
| `targetType` | enum `product\|category\|order-set\|all-products` | |
| `product` | relation manyToOne → `product` | при `targetType = product` |
| `category` | relation manyToOne → `category` | при `category` |
| `orderSet` | relation manyToOne → `order-set` | при `order-set` |
| `exclude` | boolean, default false | исключение: «−10% на категорию, кроме товара Y» |

В Strapi нет полиморфной связи, поэтому вместо пары `targetType + targetId` — отдельные типизированные nullable-связи. Сервис валидирует, что заполнена ровно та, что соответствует `targetType`.

Допустимые комбинации:

| `level` | Допустимые цели |
|---|---|
| `line` | `product`, `category`, `all-products` (+ `exclude` по товарам) |
| `set` | `order-set` |
| `order` | целей нет (весь чек); ограничение по товарам — через `conditions` |

### 2.5. Типы выгоды (`benefitType`)

| Тип | `line` | `set` | `order` |
|---|---|---|---|
| `percent` | −N% от цены единицы | −N% от суммы набора | −N% от суммы чека после строчных скидок |
| `fixed_amount` | −N сум с единицы | −N сум с набора | −N сум с чека |
| `fixed_price` | единица стоит N | набор стоит N | — (недопустимо) |

Скидка никогда не делает цену меньше 0 (и меньше 1 сума за единицу). «Купи 2, получи 3-й» в этой итерации не делаем; модель допускает добавить `benefitType = buy_x_get_y` позже без миграции.

### 2.6. Условия (`conditions`)

JSON с необязательными ключами; все заданные условия должны выполниться (И):

```json
{
  "minSubtotal": 150000,
  "minQty": 3,
  "deliveryMethods": ["courier_now"],
  "paymentMethods": ["cash", "click"],
  "clientKinds": ["individual"],
  "weekdays": [1, 2, 3, 4, 5],
  "timeFrom": "10:00",
  "timeTo": "16:00",
  "sources": ["catalog", "manual", "request"]
}
```

- Время и дни недели — в `Asia/Tashkent` (константа в сервисе, не время сервера).
- `minSubtotal` для `order` — сумма строк после строчных и наборных скидок.
- `minQty` для `line` — количество единиц этого товара в заказе.
- Валидация схемы условий — в сервисе при сохранении скидки (неизвестный ключ → `400 INVALID_CONDITION`).

Промокоды (`coupon`: код, лимит использований, лимит на клиента) — следующая итерация. В `conditions` зарезервировать ключ `couponRequired: true`.

### 2.7. Набор (`order-set`)

- Состав набора (`items`: товар + количество) остаётся как есть.
- `totalPrice` и `discountPrice` **больше не хранятся руками**: цена набора = сумма текущих цен его товаров, скидка набора = скидка уровня `set`. Поля удаляются в фазе 4; до этого сервис перезаписывает их вычисленными значениями при каждом сохранении набора и при изменении цены товара, входящего в набор.
- `discountPercent/Name/From/To` переезжают в `discount` (`level = set`, цель — этот набор).

### 2.8. Изменения в заказе

**Компонент `order.line`** — добавить поля (снимок на момент заказа):

| Поле | Тип | Примечание |
|---|---|---|
| `lineKey` | string | стабильный ключ строки (`nanoid`), id компонента для ссылок не используем |
| `basePrice` | integer | базовая цена единицы из `price` |
| `priceId` | integer | id строки `price`, откуда взята цена |
| `unitPrice` | integer | цена единицы после строчных и наборных скидок |
| `orderDiscountAmount` | integer | доля скидки на чек, приходящаяся на строку |
| `lineTotal` | integer | итог строки после всех скидок: `unitPrice * qty − orderDiscountAmount` |
| `orderSetId` | integer, nullable | если строка пришла из набора |
| `setInstance` | string, nullable | ключ экземпляра набора в заказе (два одинаковых набора — два экземпляра) |
| `discounts` | json | снимок применённых скидок по строке (см. ниже) |

Старые поля `price`, `setDiscountPercent`, `fromSetName` продолжают заполняться для совместимости (`price = unitPrice`, `fromSetName` = имя набора), удаляются в фазе 4.

Снимок `discounts`:

```json
[
  { "discountId": 12, "version": 2, "name": "−20% на борщ", "level": "line",
    "benefitType": "percent", "benefitValue": 20, "amount": 9000 },
  { "discountId": 5, "version": 1, "name": "Скидка за сумму", "level": "order",
    "benefitType": "percent", "benefitValue": 5, "amount": 1850 }
]
```

`amount` — скидка на всю строку (все единицы), в сумах.

Старые заказы (до переименования) хранят в снимке поле `promotionId`. Читатели нормализуют: `discountId ?? promotionId`.

**Order** — добавить: `discountTotal` (integer, сумма всех скидок). `subtotal` = Σ `basePrice * qty` (до всех скидок), `total` = Σ `lineTotal`. `cartDiscountPercent/Amount` продолжают заполняться из скидки уровня `order` до фазы 4.

### 2.9. Content-type `order-discount`

Плоская запись «скидка → заказ → строка → сумма» для отчётов («сколько отдали по скидке X за месяц») без разбора JSON. Пишется вместе с заказом, не редактируется.

| Поле | Тип |
|---|---|
| `order` | relation manyToOne → `order`, required |
| `discount` | relation manyToOne → `discount`, required |
| `discountVersion` | integer |
| `level` | enum `line\|set\|order` |
| `lineKey` | string |
| `amount` | integer |
| `createdAt` | (стандартное) |

При отмене заказа записи не удаляются; отчёты фильтруют по `order.status != canceled`.

---

## 3. Сервис расчёта (`pricing`)

Вся логика — в `backend/src/api/price/services/pricing.ts`. `order.service` использует его вместо `computeItems`/`computeCartDiscount`/`pickTier`, которые удаляются.

### 3.1. Интерфейс

```ts
type QuoteInput = {
  items: Array<
    | { type: 'product'; productId: number; qty: number }
    | { type: 'set'; orderSetId: number; qty: number }   // сервер сам разворачивает состав
  >
  deliveryMethod?: 'courier_now' | 'preorder'
  paymentMethod?: string
  clientId?: number | null
  source: 'catalog' | 'request' | 'manual'
  at?: Date            // момент расчёта, по умолчанию now; для предзаказа — тоже now
}

type Quote = {
  lines: QuoteLine[]                // готовы к записи в order.items
  subtotal: number
  discountTotal: number
  total: number
  appliedDiscounts: Array<{ discountId: number; name: string; publicLabel?: string; amount: number }>
  hints: Array<{ code: 'NEXT_TIER'; discountId: number; missing: number; label: string }>  // «добавьте ещё 30 000 до скидки 10%»
  explanations: Array<{ discountId: number; applied: boolean; reason?: string }>          // для админки и отладки
}

pricing.quote(input: QuoteInput): Promise<Quote>          // чистый расчёт, ничего не пишет
pricing.resolveBasePrice(productId, at): Promise<{ amount, priceId }>
pricing.setPrice(productId, amount, validFrom, employeeId)
pricing.catalogPricing(productIds | orderSetIds, at)       // для выдачи каталога (раздел 4)
```

Внутренняя функция `evaluate(cartSnapshot, activeDiscounts, context)` — **чистая**: на вход загруженные данные, на выход результат, без обращения к БД. Её покрывают unit-тесты (раздел 7).

### 3.2. Алгоритм

1. **Развернуть корзину.** `set` → строки его товаров с `orderSetId` и уникальным `setInstance` на каждую единицу набора (qty набора 2 → два экземпляра). Одинаковые товары вне наборов склеиваются в одну строку.
2. **Базовые цены.** Для каждой строки `resolveBasePrice(productId, at)`. Нет действующей цены или товар `available = false` → `400 PRODUCT_UNAVAILABLE` с id товара.
3. **Загрузить кандидатов.** Скидки `status = active`, `startsAt <= at < endsAt`, с целями на товары/категории/наборы из корзины, плюс все `level = order`. Одним-двумя запросами, не в цикле.
4. **Строчные скидки (`line`).** Для каждой строки — скидки, чья цель совпадает с товаром или его категорией (и нет `exclude` на этот товар), условия выполнены. Порядок по `priority`. В каждой `exclusiveGroup` остаётся одна — дающая наибольшую скидку. Если среди подходящих есть `stackable = false` — применяется только самая выгодная одна скидка. Иначе — последовательно, каждая от цены после предыдущей. Результат округляется до целого сума **на единицу**. Строки, попавшие в набор (`setInstance != null`), пропускают этот шаг: товар внутри набора получает только скидку набора.
5. **Скидки наборов (`set`).** Для каждого экземпляра набора: сумма его строк → применить скидку набора → разница распределяется по строкам экземпляра пропорционально их сумме (раздел 3.3) и записывается в `unitPrice`. Если при этом получается дробная цена единицы — остаток уходит в `orderDiscountAmount`.
6. **Скидка на чек (`order`).** Считается от суммы после шагов 4–5. Проверка условий (`minSubtotal`, `deliveryMethods` и т.д.). Пороговые скидки (бывшие `tiers`) — это несколько скидок в одной `exclusiveGroup`, поэтому срабатывает самая выгодная — ровно поведение текущего `pickTier`. `maxDiscountAmount` ограничивает сумму. Скидка распределяется по строкам (3.3) в `orderDiscountAmount`.
7. **Подсказки.** Для скидок `order` с невыполненным только `minSubtotal` — `hints` с недостающей суммой (заменяет логику `nextList` в `CheckoutPage.vue`).
8. **Итоги.** `lineTotal`, `subtotal`, `discountTotal`, `total`; инвариант `subtotal − discountTotal = total = Σ lineTotal` проверяется в конце, нарушение — исключение (это баг, а не ошибка пользователя).

### 3.3. Распределение суммы по строкам

```
share_i = floor(amount * base_i / Σ base)
остаток = amount − Σ share_i  → добавляется строке с наибольшим base (при равенстве — первой)
```

Функция `allocate(amount, bases[])` — отдельная, с тестами: сумма долей всегда равна `amount`, ни одна доля не больше `base_i`.

### 3.4. Совместимость входа `/api/orders/place`

Текущий клиент шлёт строки товаров с `price`, `setDiscountPercent`, `fromSetName`. В переходный период `place` принимает оба формата:

- новый: `items: [{ type: 'product' | 'set', ... }]`;
- старый: строки с `productId` и `orderSetId` (если есть) — сервер группирует строки с одинаковым `orderSetId`, восстанавливает число экземпляров набора по составу и считает как набор. `price`, `setDiscountPercent` из тела **игнорируются**.

Старый формат удаляется в фазе 4 после перевода клиента.

---

## 4. API

Публичные (policy `public-catalog`):

```
POST /api/pricing/quote               расчёт корзины для клиента (тело — QuoteInput без source, source=catalog)
GET  /api/discounts/public            активные скидки с showInCatalog для страницы «Скидки»
GET  /api/promotions/public           @deprecated — алиас, один релиз
```

Выдача каталога (`GET /api/products`, `/api/order-sets`, их `findOne`): к каждой записи сервер добавляет вычисленный объект и **больше не отдаёт** сырые поля скидок:

```json
"pricing": {
  "basePrice": 45000,
  "finalPrice": 36000,
  "discountPercent": 20,
  "label": "−20% до пятницы",
  "endsAt": "2026-11-06T19:00:00Z",
  "nextPrice": null
}
```

Для набора дополнительно `itemsTotal` (сумма товаров без скидки набора). Реализация — override `find`/`findOne` контроллеров `product` и `order-set` (или middleware маршрута), с одним пакетным вызовом `pricing.catalogPricing()` на всю страницу выдачи.

Сотрудники (`/api/staff/*`, policy `is-staff`):

```
GET    /staff/products/:id/prices               история и плановые цены
POST   /staff/products/:id/prices               { amount, validFrom?, comment }      manager
DELETE /staff/prices/:id                        только будущая плановая               manager

GET    /staff/discounts?status=&level=&q=
POST   /staff/discounts                                                                manager
GET    /staff/discounts/:id                     + targets, версии, статистика применения
PATCH  /staff/discounts/:id                     может вернуть новую версию (2.3)       manager
POST   /staff/discounts/:id/status              { status }                             manager
POST   /staff/discounts/:id/simulate            { QuoteInput } → Quote с explanations
GET    /staff/discounts/report?from=&to=        по order-discount: сколько раз, на какую сумму

/staff/promotions*                              @deprecated — алиасы, один релиз

POST   /staff/orders/preview                    (есть) — теперь через pricing.quote
```

Коды ошибок: `PRICE_PERIOD_OVERLAP`, `PRICE_IN_PAST`, `PRODUCT_UNAVAILABLE`, `INVALID_CONDITION`, `INVALID_TARGET`, `DISCOUNT_ARCHIVED`.

---

## 5. Фронтенд

### 5.1. Клиентский каталог (`client/`)

- Удалить локальные формулы: `finalPrice`/`hasDiscount` в `services/api.ts`, `productEffectivePrice` в `stores/cart.ts`, расчёты в `ProductCard.vue`, `ProductPage.vue`, `UpsellModal.vue`, `SearchPage.vue`, `DiscountsPage.vue`, `HomePage.vue`, `SetPage.vue`, `CartPage.vue`. Везде использовать `product.pricing` / `set.pricing` из ответа.
- Корзина хранит только `{ type, productId | orderSetId, qty }` (+ кеш имени/картинки для отображения). Набор в корзине — одна позиция, а не россыпь товаров.
- Суммы корзины и чекаута — из `POST /api/pricing/quote` (debounce ~300 мс после изменения корзины/способа доставки/оплаты). Подсказка «добавьте ещё N до скидки» — из `quote.hints`.
- На чекауте отправляется та же корзина; итог в заказе совпадает с последним `quote`. Если сервер вернул другую сумму (цена изменилась) — показать «Цена обновилась» и новый итог перед подтверждением.
- Миграция `localStorage` корзины: старые строки с `orderSetId` схлопнуть в позицию набора, остальные — в товары; цены из старых строк не используются.

### 5.2. Админка (`admin/`)

- **Карточка товара** (`ProductEditor.vue`): поле цены заменить блоком «Цена»: текущая цена, кнопка «Изменить цену» (сумма, с какого момента — сейчас / дата, комментарий), таблица истории и плановых цен. Блок скидки в карточке заменить списком скидок, действующих на товар, со ссылками и кнопкой «Создать скидку на этот товар».
- **Наборы** (`OrderSets.vue`): цена набора только для чтения (вычисленная), скидка — через скидку уровня `set`.
- **Раздел «Скидки»** (`/discounts`, группа «Продажи», только `manager`): таблица (название, уровень, выгода, период, статус, применений/сумма за 30 дней), редактор (основное, цели с поиском товаров/категорий/наборов и исключениями, условия формой — не JSON, приоритет/сочетаемость/группа), вкладка «Проверка» — собрать тестовую корзину и увидеть `explanations`.
- **«Скидки на чек»** (`CartDiscount.vue`): после миграции раздел удаляется из сайдбара; пороговые скидки живут как скидки уровня `order` в группе `cart-tier`. В редакторе — пресет «Скидка за сумму чека» для быстрого создания порогов.
- **Заказ**: в детальном просмотре по каждой строке показывать базовую цену, применённые скидки (из `discounts`), итог строки; внизу — `discountTotal` по скидкам.
- Типы — в `admin/src/services/resources.ts`, UI — в текущем стиле (PrimeVue 4 + токены `style.css`).

---

## 6. Миграция данных

Идемпотентная функция `migratePricingV1()` в `backend/src/api/price/services/pricing.ts`, вызывается из `bootstrap` в `backend/src/index.ts`, флаг выполнения — `strapi.store({ type: 'core', name: 'souppack' })` ключ `pricing-migrated-v1`. Перед запуском на проде — дамп Postgres.

1. Для каждого товара: `price { amount: round(product.price), validFrom: product.createdAt }`.
2. Товар с `discountPercent > 0` → `discount { level: line, benefitType: percent, benefitValue: discountPercent, name: discountName || 'Скидка на <товар>', startsAt: discountFrom, endsAt: discountTo (+1 день, т.к. сейчас это дата включительно), status: active если период не истёк, иначе archived }` + target на товар.
3. Набор с `discountPercent > 0` → `discount { level: set, ... }` + target на набор. Если заполнен только `discountPrice` без процента → `benefitType: fixed_price`.
4. `cart-discount.tiers` → по скидке `level: order` на каждый порог: `conditions { minSubtotal, deliveryMethods: ['courier_now'] }`, `exclusiveGroup: 'cart-tier'`, `publicLabel = cart-discount.label`, `status = courierNowEnabled ? active : paused`.
5. Старые заказы не пересчитываются и не мигрируются: `lineTotal` и прочие новые поля у них пустые, просмотр заказа должен это корректно показывать (fallback на `price * qty`).
6. Сверка после миграции: для 20 случайных корзин `pricing.quote` совпадает с прежним расчётом `preview`. Расхождения — в лог.

Отдельная миграция `20261102000000-rename-promotions-to-discounts.js` переименовывает таблицы `promotions` → `discounts`, `promotion_targets` → `discount_targets`, колонки `order_discounts.promotion_id → discount_id`, `order_discounts.promotion_version → discount_version`, и все link-таблицы Strapi с `promotion` в имени. id и documentId сохраняются (на id ссылаются заказы). Старые таблицы не удаляются — они просто переименованы.

---

## 7. Тесты

Добавить `vitest` в `backend` (если нет) и покрыть чистые функции:

- `allocate`: сумма долей = исходной, остаток уходит наибольшей строке, нули и одна строка.
- `evaluate`: процент/фикс/фикс-цена на строке; категория + исключение товара; две скидки в одной `exclusiveGroup` → выбрана выгоднейшая; `stackable = false`; набор поверх скидки товара; набор `stackable = false`; скидка на чек по порогам (повторяет текущее поведение `pickTier`); `maxDiscountAmount`; условия по дню недели и времени в Asia/Tashkent; скидка вне периода не применяется; цена не уходит ниже 1 сума; инвариант итогов.
- `resolveBasePrice`: граница `validTo` не включительно; плановая цена до и после даты.

Тесты табличные: «корзина + скидки → ожидаемые строки и итог».

---

## 8. Порядок работ и критерии готовности

После каждой фазы: `cd backend && npm run build && npx vitest run`, `cd admin && npx vue-tsc -b`, `cd client && npx vue-tsc -b`, ручная проверка сценариев фазы. Не переходи к следующей, пока не выполнены критерии текущей.

**Фаза 1 — срочные исправления (без новых сущностей)**
- `computeItems` учитывает `discountFrom/discountTo` товара (в Asia/Tashkent).
- Сервер применяет скидку набора: по `orderSetId` строки берёт набор из БД и его действующую скидку; `setDiscountPercent` из тела игнорируется. Сейчас `CheckoutPage.vue` **не отправляет** `orderSetId` строки (он есть только в `cart.ts`) — добавить его в payload `items`.
- Клиентские `finalPrice`/`hasDiscount` учитывают даты.
- ✔ Сумма на чекауте совпадает с `total` созданного заказа для корзины с набором со скидкой. ✔ Товар с истёкшей `discountTo` продаётся по полной цене везде.

**Фаза 2 — цены**
- `price`, `pricing.resolveBasePrice/setPrice`, миграция шага 1, `product.price` как кеш, блок «Цена» в карточке товара, вычисляемая цена набора.
- ✔ Изменение цены создаёт новую строку, история видна. ✔ Плановая цена вступает в силу в указанный момент без ручных действий. ✔ Старые заказы показывают прежние цены.

**Фаза 3 — скидки и движок**
- `discount`, `discount-target`, `order-discount`, `pricing.quote/evaluate/allocate`, новые поля `order.line`/`order`, перевод `order.service` на `pricing`, миграция шагов 2–4, раздел «Скидки», `simulate`, просмотр скидок в заказе, тесты раздела 7.
- ✔ Все тесты зелёные. ✔ Сверка миграции (шаг 6) без неожиданных расхождений. ✔ Скидка на категорию с исключением товара работает. ✔ Пороговая скидка на чек ведёт себя как раньше. ✔ Изменение применённой скидки создаёт новую версию, старый заказ ссылается на старую.

**Фаза 4 — фронт и уборка**
- Клиент на `pricing` из выдачи и `/api/pricing/quote`, корзина с позициями-наборами, миграция `localStorage`. Удаление старых полей (`product.price/oldPrice/discount*`, `order-set.totalPrice/discountPrice/discount*`, `cart-discount`, `discount.tier`, `order.line.setDiscountPercent`, старый формат `place`), раздела «Скидки на чек».
- ✔ `grep -rn "discountPercent" client/src admin/src` находит только чтение `pricing.discountPercent`. ✔ Нет расчётов скидок вне `backend/src/api/price`.

**Фаза 5 — по согласованию**
- Промокоды (`coupon`), прайс-лист для магазинов, «купи N — получи M», отчёт по скидкам на дашборде. Отдельная сущность `campaign` (маркетинговая кампания, может содержать скидки).

---

## 9. Открытые вопросы (приняты значения по умолчанию)

Если владелец не ответил иначе — делай по умолчанию и не блокируйся:

1. **Сочетается ли скидка набора со скидкой товара?** Нет — товар внутри набора получает только скидку набора (решение зафиксировано в `evaluate`, строка «if (line.setInstance) continue»). Если надо изменить — делается через поле `priority` и перепроектирование шага 4 алгоритма.
2. **Сочетается ли скидка на чек со скидками товаров?** Да; считается от суммы после них.
3. **Отдельные цены для магазинов?** Нет, общие; `price-list` — задел (2.2).
4. **Цена для предзаказа** — фиксируется в момент оформления, а не в момент доставки.
5. **Если цена изменилась между добавлением в корзину и оформлением** — заказ создаётся по актуальной цене, клиент видит предупреждение (5.1).
6. **Промокоды** — следующая итерация.
