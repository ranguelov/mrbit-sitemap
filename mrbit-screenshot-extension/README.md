# MrBit Screenshot Helper

Chrome-расширение для сайтмапа (`sitemap-tab.html` / `worker.js`). Делает скриншоты страниц
**через твой собственный браузер** — тот же IP (Cato VPN), те же куки, никакой бот-защиты.

## Установка

1. Открой `chrome://extensions`
2. Включи **Developer mode** (переключатель справа вверху)
3. **Load unpacked** → выбери папку `mrbit-screenshot-extension`
4. **Важно, если сайтмап открывается с диска (`file://`):**
   нажми **Details** у расширения → включи **«Allow access to file URLs»**.
   Без этого Chrome не внедряет content script в `file://` страницы, и сайтмап
   будет вечно показывать «Extension not installed».
5. Перезагрузи страницу сайтмапа (Cmd+R)

## Проверка, что работает

Открой DevTools (Cmd+Opt+I) на странице сайтмапа. В консоли должно быть:

```
[mrbit-ext] content script ready, v1.1.0 @ file:
[mrbit] screenshot extension detected v1.1.0
```

Если первой строки нет — content script не внедрился: скорее всего не включён
«Allow access to file URLs» (для `file://`), либо расширение выключено.

Если есть первая строка, но нет второй — обновилась только страница, но не расширение;
нажми ↻ на карточке расширения в `chrome://extensions`, потом перезагрузи страницу.

## Как это работает

```
страница ──mrbit-ext-screenshot{url,id}──► content.js ──sendMessage──► background.js
                                                                            │
                                                    windows.create (popup 400px)
                                                    ждём status === 'complete'
                                                    +2.5s на JS/картинки
                                                    tabs.captureVisibleTab
                                                    windows.remove
                                                                            │
страница ◄──mrbit-ext-result{id,ok,dataUrl}── content.js ◄──sendResponse────┘
```

Handshake: content.js работает на `document_start` (раньше инлайн-скрипта страницы),
поэтому шлёт `mrbit-ext-ready` многократно в течение ~6 секунд **и** отвечает на
каждый `mrbit-ext-ping` от страницы. Страница, в свою очередь, пингует с ретраями.
Порядок загрузки перестаёт иметь значение.

## Настройки

В `background.js`:

| Константа | По умолчанию | Что делает |
|---|---|---|
| `DEFAULT_WIDTH` | `400` | ширина popup-окна; Chrome не даёт уже ~400px |
| `DEFAULT_HEIGHT` | `1000` | высота — сколько страницы попадёт в кадр |
| `SETTLE_MS` | `2500` | пауза после загрузки (JS, ленивые картинки, куки-баннеры) |
| `LOAD_TIMEOUT_MS` | `30000` | максимум ожидания загрузки |

## Известные ограничения

- Захватывается **видимая область**, а не вся страница целиком. Нужен полный скролл —
  придётся добавить scroll-and-stitch или `chrome.debugger` + `Page.captureScreenshot`.
- Окно 400px даёт мобильные CSS-брейкпоинты, но **User-Agent остаётся десктопным**.
  Настоящая мобильная эмуляция требует `chrome.debugger` + `Emulation.setDeviceMetricsOverride`.
- `matches` в манифесте покрывает все http/https страницы. Content script крошечный,
  но если хочется — сузь до своего домена + `file:///*`.
