# cloudFRT — assets/js

Клиентские JS-модули платформы cloudFRT.

Собираются webpack в бандлы (`public/js/`). Точка входа — `index.js`, который экспортирует все модули в глобальный объект `window._$`.

---

## Структура

```
assets/js/
├── index.js          # Точка входа — сборка _$ и экспорт в window
├── package.js        # Bootstrap: создаёт window._$ (если не существовал)
├── system/           # Утилиты (низкоуровневые)
│   ├── each.js       # each(), has()
│   ├── extend.js     # extend()
│   ├── fetch.js      # ajax()
│   ├── message.js    # iziToast-уведомления
│   └── attribute.js  # attr(), data()
├── core/
│   └── gb.js         # formatBytes()
├── form/
│   └── index.js      # Form — класс-обёртка над document.forms
├── modal/
│   └── index.js      # Dialog — модальные окна на <dialog>
├── html-formatting/  # Сторонняя либа (html-formatting.js) — форматирование HTML
└── tinymce/          # Локализация tinymce + oxide-icon-pack-template
```

---

## Использование

### Основной API

После импорта `index.js` webpack-бандл собирает всё в `window._$`:

```js
_$.message('success', { title: '✓', message: 'Готово' })
_$.ajax('/api/data').then(data => { /* ... */ })
_$.each(array, (item, i) => { /* ... */ })
new _$.Form('formName')
new _$.Dialog('#my-dialog')
```

---

## Модули

### `index.js` — Точка входа

Импортирует все модули и собирает их в объект `_$`, который затем вешается на `window._$`.

```js
window._$ = {
  tippy, extend, each, ajax, delegate,
  Form, message, data, attr, gb, Dialog
}
```

В бандл также попадают стили `index.scss`, `tippy.js/dist/tippy.css` и `iziToast.css`.

### Модули `system/`

#### `each.js` — `each(obj, iterator, context)`

Универсальный итератор. Работает с массивами и объектами. Поддерживает ранний выход через возврат `breaker`.

```js
_$.each([1,2,3], (val, i) => console.log(i, val))
_$.each({a:1, b:2}, (val, key) => console.log(key, val))
```

Также экспортирует `has(obj, key)` — `hasOwnProperty` shortcut.

#### `extend.js` — `extend(...objs)`

Мелкое слияние объектов. Принимает любое количество аргументов.

```js
_$.extend({a:1}, {b:2}) // → {a:1, b:2}
```

#### `fetch.js` — `ajax(url, options)`

Обёртка над `fetch`. По умолчанию:
- `method: 'GET'`
- `headers: { 'Content-Type': 'application/json;charset=utf-8' }`
- Ответ автоматически парсится как JSON (`.json()`)

Параметр `options` — объект, который мержится с дефолтами через `_$.extend`. Можно передать функцию — тогда будут использованы настройки по умолчанию.

```js
// GET запрос
_$.ajax('/api/users').then(data => { /* ... */ })

// POST с телом
_$.ajax('/api/users', {
  method: 'POST',
  body: { name: 'Иван' }
}).then(data => { /* ... */ })
```

#### `message.js` — `message(action, settings, fn?)`

Обёртка над `izitoast`. Создаёт всплывающие уведомления.

**Параметры:**
- `action` — метод iziToast: `'success'`, `'error'`, `'info'`, `'warning'`
- `settings` — объект с настройками: `title`, `message`, `position` и любые другие опции iziToast
- `fn` (опц.) — callback, который будет вызван при закрытии (через `onClosing`)

**Умолчания:**
- `position: 'topRight'`, если не указана явно в `settings`

**Доступные позиции:** `'center'`, `'bottomRight'`, `'bottomLeft'`, `'topRight'`, `'topLeft'`, `'topCenter'`, `'bottomCenter'`

```js
_$.message('success', {
  title: '✓',
  message: 'Сохранено',
  position: 'topRight'
})

_$.message('error', {
  title: '✗',
  message: 'Ошибка сети'
})

_$.message('info', {
  title: '⏳',
  message: 'Загрузка…'
})
```

#### `attribute.js` — `attr(element, options)`, `data(e, attr?, val?)`

**`attr(element, options)`** — устанавливает атрибуты элементу. Если в options есть ключ `'class'`, добавляет CSS-класс.

```js
_$.attr(el, { class: 'active', 'data-id': '123' })
```

**`data(e, attr?, val?)`** — чтение/запись `data-*` атрибутов.

- `_$.data(event)` — возвращает `element.dataset` (все data-атрибуты)
- `_$.data(event, 'name')` — возвращает `element.dataset.name`
- `_$.data(event, 'name', 'value')` — устанавливает `element.dataset.name = 'value'`

### `core/gb.js` — `formatBytes(bytes, decimals?, txt?)`

Форматирование размера файла.

```js
_$.gb(1234567)        // → "1.18"
_$.gb(1234567, 0)     // → "1"
_$.gb(1234567, 2, true) // → "1.18MB"
```

### `form/index.js` — `Form`

Базовый класс-обёртка над формой.

```js
// По имени формы
const form = new _$.Form('myFormName')

// По DOM-элементу
const form = new _$.Form(document.querySelector('#my-form'))
```

На данный момент только сохраняет ссылку в `this._form`.

### `modal/index.js` — `Dialog`

Модальные/диалоговые окна на основе нативного `<dialog>` + полифилл `dialog-polyfill`.

```js
const dlg = new _$.Dialog('#my-dialog')
dlg.header('Заголовок').content('Текст')
dlg.initClose()          // кнопка #modal-close → закрытие
dlg.show(result => {
  console.log('Result:', result)
})
dlg.close()
```

**API:**
- `header(text, selector?)` — установить заголовок (по умолчанию `.modal-title`)
- `content(text, selector?)` — установить текст (по умолчанию `.modal-content`)
- `show(callback?)` — показать модалку. Если передан callback, будет вызван при закрытии со значением `returnValue`
- `close()` — закрыть окно
- `initClose()` — привязать закрытие к кнопке `#modal-close`
- `.element` — getter/setter для DOM-элемента диалога

### `package.js` — Bootstrap

Создаёт `window._$` если его ещё нет. Инициализируется до `index.js`. Поддерживает AMD и CommonJS.

```js
(function (window) {
  if (window.Package) { _$ = {} }
  else { window._$ = {} }
})(window)
```

---

## Сторонние зависимости

| Пакет | Назначение | Где используется |
|-------|-----------|------------------|
| `tippy.js` | Тултипы | `_$.tippy` |
| `izitoast` | Всплывающие уведомления | `_$.message` |
| `delegate` | Делегирование событий | `_$.delegate` |
| `dialog-polyfill` | Полифилл `<dialog>` | `modal/index.js` |
| `tinymce` | WYSIWYG-редактор | — |
| `html-formatting.js` | Форматирование HTML-кода | vendored |

---

## Добавление нового модуля

1. Создать файл в `system/`, `core/` или отдельной папке
2. Импортировать его в `index.js`
3. Добавить в объект `_$`