"use strict";
(self["webpackChunkcloudFRT"] = self["webpackChunkcloudFRT"] || []).push([["destinations_admin"],{

/***/ "./microservices/destinations/assets/scss/admin.scss"
/*!***********************************************************!*\
  !*** ./microservices/destinations/assets/scss/admin.scss ***!
  \***********************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
// extracted by mini-css-extract-plugin


/***/ },

/***/ "./microservices/destinations/assets/js/admin.js"
/*!*******************************************************!*\
  !*** ./microservices/destinations/assets/js/admin.js ***!
  \*******************************************************/
(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony import */ var _scss_admin_scss__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../scss/admin.scss */ "./microservices/destinations/assets/scss/admin.scss");
// ============================================================
// destinations — клиент админ-панели (page/admin.html)
// Drill-down навигация: корень → страны → регионы → места → достопр.
// Данные приходят из <script id="admin-data"> (админData от контроллера).
// Дети грузятся лениво через GET /destinations/admin/children.
// ============================================================

(function () {
  'use strict';

  var DATA = document.getElementById('admin-data');
  var parsed = {};
  try {
    parsed = DATA ? JSON.parse(DATA.textContent || '{}') : {};
  } catch (e) {
    parsed = {};
  }
  var CSRF = parsed.csrf || '';
  var API = parsed.api || '/destinations/admin';
  var LEVELS = parsed.levels || ['country', 'region', 'place', 'attraction'];
  // следующий уровень от текущего (для авто-уровня «Добавить»)
  var NEXT_LEVEL = {
    country: 'region',
    region: 'place',
    place: 'attraction',
    attraction: null
  };
  // label уровня на русском
  var LEVEL_LABEL = {
    country: 'страна',
    region: 'регион',
    place: 'место',
    attraction: 'достопримечательность'
  };
  function el(id) {
    return document.getElementById(id);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ---- tinymce хелперы для поля #f-content ----
  // Возвращают current content редактора или (если редактор ещё не создан)
  // значение textarea — чтобы форма работала и при первом рендере до init.
  function contentEditor() {
    return window.tinymce && tinymce.get('f-content') ? tinymce.get('f-content') : null;
  }
  function getContent() {
    var ed = contentEditor();
    return ed ? ed.getContent() : el('f-content').value;
  }
  function setContent(html) {
    var ed = contentEditor();
    if (ed) ed.setContent(html || '');
    el('f-content').value = html || '';
  }

  // ---- уровень для нового узла в текущем контексте ----
  function nextLevel(rlevel) {
    return rlevel ? NEXT_LEVEL[rlevel] : 'country';
  }
  var state = {
    current: null,
    // RID текущего узла (null = корень)
    currentNode: null,
    // {rid,title,level} текущего узла
    ancestors: [],
    // цепочка [{rid,title,level}] от корня к текущему (без текущего)
    children: [],
    // дети текущего узла (загруженная часть)
    searchResults: [],
    // результаты глобального поиска
    total: 0,
    // всего детей у текущего узла
    offset: 0,
    // текущий сдвиг в пагинации
    limit: 50,
    // размер страницы
    hasMore: false,
    // есть ли ещё не загруженные дети
    editing: false // режим формы: false=новый, true=редактирование
  };

  // ---- загрузка детей узла (или корня), первая страница ----
  function loadChildren(parentRid) {
    setLoading(true);
    state.offset = 0;
    var url = API + '/children' + (parentRid ? '?parent=' + encodeURIComponent(parentRid) : '?root=1') + '&offset=0&limit=' + state.limit;
    fetch(url).then(function (r) {
      return r.json();
    }).then(function (j) {
      state.current = parentRid;
      state.currentNode = j.node || null;
      state.ancestors = j.ancestors || [];
      state.children = j.children || [];
      state.total = j.total || 0;
      state.offset = j.offset || 0;
      state.hasMore = !!j.hasMore;
      renderAll();
    })["catch"](function (e) {
      setLoading(false);
      setMsg('Ошибка загрузки: ' + e.message, 'err');
    });
  }

  // ---- догрузка следующей страницы детей ('Показать ещё') ----
  function loadMore() {
    var nextOffset = state.offset + state.children.length;
    var url = API + '/children' + (state.current ? '?parent=' + encodeURIComponent(state.current) : '?root=1') + '&offset=' + nextOffset + '&limit=' + state.limit;
    var btn = document.getElementById('adm-more');
    if (btn) btn.disabled = true;
    fetch(url).then(function (r) {
      return r.json();
    }).then(function (j) {
      state.children = state.children.concat(j.children || []);
      state.total = j.total || state.total;
      state.offset = j.offset || 0;
      state.hasMore = !!j.hasMore;
      renderAll();
    })["catch"](function (e) {
      setMsg('Ошибка загрузки: ' + e.message, 'err');
      if (btn) btn.disabled = false;
    });
  }

  // ---- рендер всего ----
  function renderAll() {
    renderCrumbs();
    renderList();
    // при смене навигации «новый» узел создаётся в текущем контексте
    newNode();
  }

  // ---- хлебные крошки ----
  function renderCrumbs() {
    var c = el('adm-crumbs');
    c.innerHTML = '';
    c.appendChild(makeCrumb('Куда поехать', null));
    state.ancestors.forEach(function (a) {
      c.appendChild(makeCrumb(a.title || a.slug, a.rid));
    });
    if (state.currentNode) {
      var cur = document.createElement('span');
      cur.className = 'adm-crumb adm-crumb-current';
      cur.textContent = state.currentNode.title || state.currentNode.slug;
      c.appendChild(cur);
    }
  }
  function makeCrumb(text, rid) {
    var b = document.createElement('a');
    b.className = 'adm-crumb';
    b.href = '#';
    b.textContent = text;
    b.setAttribute('data-go', 'crumb');
    b.setAttribute('data-rid', rid || '');
    return b;
  }

  // ---- список детей ----
  function renderList() {
    var list = el('adm-list');
    var title = el('adm-list-title');
    list.innerHTML = '';
    if (!state.currentNode) title.textContent = 'Направления (страны)';else title.textContent = (state.currentNode.title || state.currentNode.slug) + ' — разделы';
    var q = (el('adm-search').value || '').trim();
    // глобальный поиск активируется при ≥3 символах
    if (q.length >= 3) {
      renderSearchResults();
      return;
    }
    var lq = q.toLowerCase();
    var filtered = state.children.filter(function (n) {
      if (!lq) return true;
      return (n.title || '').toLowerCase().indexOf(lq) !== -1 || (n.slug || '').toLowerCase().indexOf(lq) !== -1;
    });
    if (!filtered.length) {
      list.innerHTML = '<div class="adm-empty">' + (state.children.length ? 'Ничего не найдено' : 'Нет узлов. Добавьте первый.') + '</div>';
      return;
    }
    filtered.forEach(function (n) {
      list.appendChild(makeItem(n));
    });
    renderMoreButton(list);
  }

  // ---- кнопка «Показать ещё» при неполной загрузке ----
  function renderMoreButton(list) {
    // в режиме глобального поиска кнопка не нужна
    if ((el('adm-search').value || '').trim().length >= 3) return;
    if (!state.hasMore) return;
    var remaining = state.total - state.children.length;
    var wrap = document.createElement('div');
    wrap.className = 'adm-more-wrap';
    wrap.innerHTML = '<button class="adm-btn adm-btn-more" id="adm-more">Показать ещё (' + remaining + ')</button>';
    list.appendChild(wrap);
  }

  // ---- глобальные результаты поиска (в том же левом списке) ----
  function renderSearchResults() {
    var list = el('adm-list');
    var title = el('adm-list-title');
    list.innerHTML = '';
    title.textContent = 'Результаты глобального поиска';
    if (!state.searchResults.length) {
      list.innerHTML = '<div class="adm-empty">Ничего не найдено по всему каталогу</div>';
      return;
    }
    state.searchResults.forEach(function (n) {
      list.appendChild(makeSearchItem(n));
    });
  }

  // ---- строка списка (ребёнок текущего узла) ----
  function makeItem(n) {
    var item = document.createElement('div');
    item.className = 'adm-item';
    item.setAttribute('data-rid', n.rid || '');
    item.innerHTML = '<span class="adm-item-badge">' + esc(LEVEL_LABEL[n.level] || n.level) + '</span>' + '<span class="adm-item-title">' + esc(n.title || n.slug) + '</span>' + '<span class="adm-item-actions">' + '<button class="adm-btn adm-btn-mini" data-act="edit" title="Редактировать">✎</button>' + '<button class="adm-btn adm-btn-mini adm-btn-danger" data-act="del" title="Удалить">🗑</button>' + '<span class="adm-item-go" title="Войти в раздел">›</span>' + '</span>';
    return item;
  }

  // ---- строка результата глобального поиска (с путём, клик = редактирование) ----
  function makeSearchItem(n) {
    var item = document.createElement('div');
    item.className = 'adm-item adm-item-search';
    item.setAttribute('data-rid', n.rid || '');
    item.setAttribute('data-search', '1');
    item.innerHTML = '<span class="adm-item-badge">' + esc(LEVEL_LABEL[n.level] || n.level) + '</span>' + '<span class="adm-item-body">' + '<span class="adm-item-title">' + esc(n.title || n.slug) + '</span>' + '<span class="adm-item-path">' + esc(n.path || '') + '</span>' + '</span>' + '<span class="adm-item-actions">' + '<button class="adm-btn adm-btn-mini" data-act="edit" title="Редактировать">✎</button>' + '</span>';
    return item;
  }

  // ---- глобальный поиск по каталогу (≥3 символа) ----
  var searchTimer = null;
  function doGlobalSearch(q) {
    setLoading(true);
    fetch(API + '/search?q=' + encodeURIComponent(q)).then(function (r) {
      return r.json();
    }).then(function (j) {
      state.searchResults = j.results || [];
      renderSearchResults();
    })["catch"](function (e) {
      setMsg('Ошибка поиска: ' + e.message, 'err');
    });
  }

  // ---- форма: новый узел в текущем контексте ----
  function newNode() {
    el('adm-form-title').textContent = 'Новый узел';
    el('f-rid').value = '';
    ['f-title', 'f-slug', 'f-h1', 'f-description', 'f-image', 'f-lat', 'f-lng', 'f-priority'].forEach(function (id) {
      el(id).value = '';
    });
    setContent('');
    // авто-уровень: в корне → страна, в стране → регион, и т.д.
    var lvl = nextLevel(state.currentNode ? state.currentNode.level : null);
    el('f-level').value = lvl || 'country';
    el('f-current-rid').value = state.current || '';
    el('f-current-level').value = state.currentNode ? state.currentNode.level : '';
    // родитель фиксируем = текущий узел (нельзя менять при создании)
    el('f-parent').innerHTML = '<option value="' + (state.current || '') + '" selected>' + (state.currentNode ? esc(state.currentNode.title || state.currentNode.slug) : '— корень —') + '</option>';
    el('f-parent').disabled = true;
    updateLevelHint();
    el('f-is_hub').checked = true;
    setMsg('');
    el('adm-cancel').style.display = 'none';
    el('adm-save').textContent = 'Создать';
    state.editing = false;
  }

  // ---- все узлы для селекта родителя (исключая сам узел и его потомков) ----
  function loadParentOptions(rid, currentParentRid, cb) {
    fetch(API + '/tree').then(function (r) {
      return r.json();
    }).then(function (j) {
      var nodes = j.tree || [];
      // путь редактируемого узла (префикс для поиска потомков)
      var selfPath = '';
      var selfLevel = '';
      nodes.forEach(function (n) {
        if (String(n.rid) === String(rid)) {
          selfPath = n.path || '';
          selfLevel = n.level || '';
        }
      });
      var opts = '<option value="">— корень —</option>';
      nodes.forEach(function (n) {
        // исключить сам узел и его потомков (path начинается с пути узла)
        if (String(n.rid) === String(rid)) return;
        if (selfPath && (n.path || '').indexOf(selfPath + '/') === 0) return;
        opts += '<option value="' + esc(n.rid) + '"' + (String(n.rid) === String(currentParentRid) ? ' selected' : '') + '>' + esc(n.path || n.slug) + ' (' + esc(LEVEL_LABEL[n.level] || n.level) + ')</option>';
      });
      cb(opts);
    })["catch"](function (e) {
      cb('<option value="">— корень —</option>');
    });
  }

  // ---- форма: редактирование конкретного узла ----
  function editNode(rid) {
    fetch(API + '/' + encodeURIComponent(rid)).then(function (r) {
      return r.json();
    }).then(function (j) {
      if (!j.dest) return setMsg('Узел не найден', 'err');
      var d = j.dest;
      el('adm-form-title').textContent = 'Редактирование: ' + (d.title || d.slug);
      el('f-rid').value = d.rid || '';
      el('f-slug').value = d.slug || '';
      el('f-title').value = d.title || '';
      el('f-h1').value = d.h1 || '';
      el('f-level').value = d.level || 'place';
      el('f-priority').value = d.priority != null ? d.priority : '';
      el('f-is_hub').checked = !(d.is_hub === false);
      el('f-image').value = d.image || '';
      el('f-description').value = d.description || '';
      setContent(d.content && d.content.html ? d.content.html : d.content || '');
      el('f-lat').value = d.lat != null ? d.lat : '';
      el('f-lng').value = d.lng != null ? d.lng : '';
      el('f-current-rid').value = d.parentRid || '';
      el('f-current-level').value = d.level || '';
      // родитель: разблокирован для перемещения, заполняется деревом
      // (исключая сам узел и его потомков — защита от циклов)
      el('f-parent').disabled = false;
      el('f-parent').innerHTML = '<option value="">— корень —</option>';
      loadParentOptions(rid, d.parentRid, function (opts) {
        el('f-parent').innerHTML = opts;
      });
      updateLevelHint();
      setMsg('');
      el('adm-cancel').style.display = 'inline-block';
      el('adm-save').textContent = 'Сохранить';
      state.editing = true;
    })["catch"](function (e) {
      setMsg('Ошибка: ' + e.message, 'err');
    });
  }
  function updateLevelHint() {
    var lvl = el('f-level').value;
    el('f-level-display').textContent = lvl ? ' (' + (LEVEL_LABEL[lvl] || lvl) + ')' : '';
  }

  // ---- сохранение (create/update) ----
  function save() {
    var rid = el('f-rid').value;
    // родитель: при редактировании — из селекта #f-parent (можно менять),
    // при создании — из скрытого контекста навигации #f-current-rid
    var parentVal = el('f-parent').disabled ? el('f-current-rid').value : el('f-parent').value;
    var payload = {
      slug: el('f-slug').value.trim(),
      title: el('f-title').value.trim(),
      h1: el('f-h1').value.trim() || undefined,
      level: el('f-level').value,
      parentRid: parentVal || null,
      description: el('f-description').value || undefined,
      content: getContent() || undefined,
      image: el('f-image').value.trim() || undefined,
      is_hub: el('f-is_hub').checked,
      priority: el('f-priority').value ? parseFloat(el('f-priority').value) : undefined,
      lat: el('f-lat').value ? parseFloat(el('f-lat').value) : undefined,
      lng: el('f-lng').value ? parseFloat(el('f-lng').value) : undefined,
      csrf: CSRF
    };
    var isNew = !rid;
    var url = isNew ? API + '/create' : API + '/' + encodeURIComponent(rid);
    var method = isNew ? 'POST' : 'PUT';
    setMsg('Сохранение…', 'info');
    fetch(url, {
      method: method,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }).then(function (r) {
      return r.json()["catch"](function () {
        return {};
      }).then(function (j) {
        return {
          status: r.status,
          json: j
        };
      });
    }).then(function (out) {
      if (out.status >= 200 && out.status < 300 && out.json.done) {
        setMsg('Сохранено ✓', 'ok');
        setTimeout(function () {
          loadChildren(state.current);
          newNode();
        }, 400);
      } else {
        var err = out.json.errors ? JSON.stringify(out.json.errors) : out.json.error || 'HTTP ' + out.status;
        setMsg('Ошибка: ' + err, 'err');
      }
    })["catch"](function (e) {
      setMsg('Ошибка сети: ' + e.message, 'err');
    });
  }

  // ---- удаление ----
  function deleteNode(rid) {
    var n = state.children.find(function (x) {
      return String(x.rid) === String(rid);
    });
    var name = n ? n.title || n.slug : rid;
    var msg = 'Удалить узел «' + name + '»?\nВложенные узлы останутся, но потеряют родителя (ребро PART_OF снимется).';
    if (!confirm(msg)) return;
    fetch(API + '/' + encodeURIComponent(rid), {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        csrf: CSRF
      })
    }).then(function (r) {
      return r.json();
    }).then(function (j) {
      if (j.done) {
        setMsg('Удалено', 'ok');
        loadChildren(state.current);
      } else setMsg('Ошибка удаления', 'err');
    })["catch"](function (e) {
      setMsg('Ошибка сети: ' + e.message, 'err');
    });
  }

  // ---- helpers ----
  function setLoading(v) {
    if (v) el('adm-list').innerHTML = '<div class="adm-empty">Загрузка…</div>';
  }
  function setMsg(txt, type) {
    var m = el('adm-msg');
    m.textContent = txt;
    m.className = 'adm-msg ' + (type || '');
  }

  // ---- события ----
  // навигация по клику на имя узла (›) или breadcrumb
  el('adm-crumbs').addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-go="crumb"]');
    if (!t) return;
    ev.preventDefault();
    var rid = t.getAttribute('data-rid') || '';
    loadChildren(rid || null);
  });

  // список: клик по строке → войти; по кнопке → edit/del
  el('adm-list').addEventListener('click', function (ev) {
    var more = ev.target.closest('#adm-more');
    if (more) {
      ev.preventDefault();
      loadMore();
      return;
    }
    var btn = ev.target.closest('button[data-act]');
    var item = ev.target.closest('.adm-item');
    if (!item) return;
    var rid = item.getAttribute('data-rid');
    var isSearch = item.getAttribute('data-search') === '1';
    var go = ev.target.closest('.adm-item-go');
    if (go && !btn && !isSearch) {
      loadChildren(rid);
      return;
    }
    if (btn) {
      var act = btn.getAttribute('data-act');
      ev.stopPropagation();
      if (act === 'edit') editNode(rid);else if (act === 'del') deleteNode(rid);
    } else if (isSearch) {
      // клик по телу результата поиска → редактирование
      editNode(rid);
    }
  });
  el('adm-search').addEventListener('input', function () {
    var q = this.value.trim();
    if (q.length >= 3) {
      // глобальный поиск с debounce 300 мс
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        doGlobalSearch(q);
      }, 300);
    } else {
      // очистка/<3 → возврат к детям текущего узла
      clearTimeout(searchTimer);
      state.searchResults = [];
      renderList();
    }
  });
  el('adm-add').onclick = function () {
    newNode();
    el('f-title').focus();
  };
  el('adm-save').onclick = function () {
    save();
  };
  el('adm-cancel').onclick = function () {
    newNode();
  };
  el('f-level').onchange = updateLevelHint;

  // ---- инициализация tinymce 8 для поля #f-content ----
  if (window.tinymce) {
    tinymce.init({
      selector: '#f-content',
      license_key: 'gpl',
      language: 'ru',
      min_height: 600,
      menubar: false,
      branding: false,
      promotion: false,
      plugins: 'lists advlist link autolink image table wordcount emoticons fullscreen visualblocks autoresize searchreplace'.split(' ').join(' '),
      toolbar: 'undo redo | blocks | bold italic underline strikethrough | forecolor backcolor | ' + 'bullist numlist | alignleft aligncenter alignright alignjustify | link image table | ' + 'emoticons visualblocks searchreplace | fullscreen',
      link_default_target: '_blank',
      link_default_protocol: 'https',
      // не даём tinymce обернуть всё в свои теги при сохранении —
      // оставляем как есть, т.к. destinations хранит content.html как есть
      valid_children: '+p[div]',
      setup: function setup(ed) {
        ed.on('init', function () {
          // если во время init уже было заполнено (напр. editNode до init),
          // синхронизируем textarea → редактор
          var val = el('f-content').value;
          if (val) ed.setContent(val);
        });
      }
    });
  }

  // ---- старт ----
  loadChildren(null);
})();

/***/ }

},
/******/ __webpack_require__ => { // webpackRuntimeModules
/******/ var __webpack_exec__ = (moduleId) => (__webpack_require__(__webpack_require__.s = moduleId))
/******/ var __webpack_exports__ = (__webpack_exec__("./microservices/destinations/assets/js/admin.js"));
/******/ }
]);