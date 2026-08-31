// ============================================================
// destinations — клиент админ-панели (page/admin.html)
// Drill-down навигация: корень → страны → регионы → места → достопр.
// Данные приходят из <script id="admin-data"> (админData от контроллера).
// Дети грузятся лениво через GET /destinations/admin/children.
// ============================================================
import '../scss/admin.scss'

;(function () {
  'use strict'
  var DATA = document.getElementById('admin-data')
  var parsed = {}
  try {
    parsed = DATA ? JSON.parse(DATA.textContent || '{}') : {}
  } catch (e) {
    parsed = {}
  }
  var CSRF = parsed.csrf || ''
  var API = parsed.api || '/destinations/admin'
  var LEVELS = parsed.levels || ['country', 'region', 'place', 'attraction']
  // следующий уровень от текущего (для авто-уровня «Добавить»)
  var NEXT_LEVEL = { country: 'region', region: 'place', place: 'attraction', attraction: null }
  // label уровня на русском
  var LEVEL_LABEL = {
    country: 'страна',
    region: 'регион',
    place: 'место',
    attraction: 'достопримечательность',
  }

  var state = {
    current: null, // RID текущего узла (null = корень)
    currentNode: null, // {rid,title,level} текущего узла
    ancestors: [], // цепочка [{rid,title,level}] от корня к текущему (без текущего)
    children: [], // дети текущего узла
    editing: false, // режим формы: false=новый, true=редактирование
  }

  function el(id) {
    return document.getElementById(id)
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  // ---- уровень для нового узла в текущем контексте ----
  function nextLevel(rlevel) {
    return rlevel ? NEXT_LEVEL[rlevel] : 'country'
  }

  // ---- загрузка детей узла (или корня) ----
  function loadChildren(parentRid) {
    setLoading(true)
    var url = API + '/children' + (parentRid ? '?parent=' + encodeURIComponent(parentRid) : '?root=1')
    fetch(url)
      .then(function (r) {
        return r.json()
      })
      .then(function (j) {
        state.current = parentRid
        state.currentNode = j.node || null
        state.ancestors = j.ancestors || []
        state.children = j.children || []
        renderAll()
      })
      .catch(function (e) {
        setLoading(false)
        setMsg('Ошибка загрузки: ' + e.message, 'err')
      })
  }

  // ---- рендер всего ----
  function renderAll() {
    renderCrumbs()
    renderList()
    // при смене навигации «новый» узел создаётся в текущем контексте
    newNode()
  }

  // ---- хлебные крошки ----
  function renderCrumbs() {
    var c = el('adm-crumbs')
    c.innerHTML = ''
    c.appendChild(makeCrumb('Куда поехать', null))
    state.ancestors.forEach(function (a) {
      c.appendChild(makeCrumb(a.title || a.slug, a.rid))
    })
    if (state.currentNode) {
      var cur = document.createElement('span')
      cur.className = 'adm-crumb adm-crumb-current'
      cur.textContent = state.currentNode.title || state.currentNode.slug
      c.appendChild(cur)
    }
  }
  function makeCrumb(text, rid) {
    var b = document.createElement('a')
    b.className = 'adm-crumb'
    b.href = '#'
    b.textContent = text
    b.setAttribute('data-go', 'crumb')
    b.setAttribute('data-rid', rid || '')
    return b
  }

  // ---- список детей ----
  function renderList() {
    var list = el('adm-list')
    var title = el('adm-list-title')
    list.innerHTML = ''
    if (!state.currentNode) title.textContent = 'Направления (страны)'
    else title.textContent = (state.currentNode.title || state.currentNode.slug) + ' — разделы'

    var q = (el('adm-search').value || '').trim().toLowerCase()
    var filtered = state.children.filter(function (n) {
      if (!q) return true
      return (
        (n.title || '').toLowerCase().indexOf(q) !== -1 ||
        (n.slug || '').toLowerCase().indexOf(q) !== -1
      )
    })

    if (!filtered.length) {
      list.innerHTML =
        '<div class="adm-empty">' + (state.children.length ? 'Ничего не найдено' : 'Нет узлов. Добавьте первый.') + '</div>'
      return
    }
    filtered.forEach(function (n) {
      var item = document.createElement('div')
      item.className = 'adm-item'
      item.setAttribute('data-rid', n.rid || '')
      item.innerHTML =
        '<span class="adm-item-badge">' + esc(LEVEL_LABEL[n.level] || n.level) + '</span>' +
        '<span class="adm-item-title">' + esc(n.title || n.slug) + '</span>' +
        '<span class="adm-item-actions">' +
        '<button class="adm-btn adm-btn-mini" data-act="edit" title="Редактировать">✎</button>' +
        '<button class="adm-btn adm-btn-mini adm-btn-danger" data-act="del" title="Удалить">🗑</button>' +
        '<span class="adm-item-go" title="Войти в раздел">›</span>' +
        '</span>'
      list.appendChild(item)
    })
  }

  // ---- форма: новый узел в текущем контексте ----
  function newNode() {
    el('adm-form-title').textContent = 'Новый узел'
    el('f-rid').value = ''
    ;['f-title', 'f-slug', 'f-h1', 'f-description', 'f-image', 'f-content', 'f-lat', 'f-lng', 'f-priority'].forEach(
      function (id) {
        el(id).value = ''
      }
    )
    // авто-уровень: в корне → страна, в стране → регион, и т.д.
    var lvl = nextLevel(state.currentNode ? state.currentNode.level : null)
    el('f-level').value = lvl || 'country'
    el('f-current-rid').value = state.current || ''
    el('f-current-level').value = state.currentNode ? state.currentNode.level : ''
    // родитель фиксируем = текущий узел (нельзя менять при создании)
    el('f-parent').innerHTML =
      '<option value="' + (state.current || '') + '" selected>' +
      (state.currentNode ? esc(state.currentNode.title || state.currentNode.slug) : '— корень —') +
      '</option>'
    el('f-parent').disabled = true
    updateLevelHint()
    el('f-is_hub').checked = true
    setMsg('')
    el('adm-cancel').style.display = 'none'
    el('adm-save').textContent = 'Создать'
    state.editing = false
  }

  // ---- форма: редактирование конкретного узла ----
  function editNode(rid) {
    fetch(API + '/' + encodeURIComponent(rid))
      .then(function (r) {
        return r.json()
      })
      .then(function (j) {
        if (!j.dest) return setMsg('Узел не найден', 'err')
        var d = j.dest
        el('adm-form-title').textContent = 'Редактирование: ' + (d.title || d.slug)
        el('f-rid').value = d.rid || ''
        el('f-slug').value = d.slug || ''
        el('f-title').value = d.title || ''
        el('f-h1').value = d.h1 || ''
        el('f-level').value = d.level || 'place'
        el('f-priority').value = d.priority != null ? d.priority : ''
        el('f-is_hub').checked = !(d.is_hub === false)
        el('f-image').value = d.image || ''
        el('f-description').value = d.description || ''
        el('f-content').value = d.content && d.content.html ? d.content.html : d.content || ''
        el('f-lat').value = d.lat != null ? d.lat : ''
        el('f-lng').value = d.lng != null ? d.lng : ''
        // родитель: показываем текущий контекст (не даём менять в этой задаче)
        var pTitle = ''
        if (state.currentNode) pTitle = state.currentNode.title || state.currentNode.slug
        else if (d.parentRid) pTitle = '(в другом разделе)'
        el('f-current-rid').value = d.parentRid || ''
        el('f-current-level').value = d.level || ''
        el('f-parent').innerHTML =
          '<option value="' + esc(d.parentRid || '') + '" selected>' + esc(pTitle || '— корень —') + '</option>'
        el('f-parent').disabled = true
        updateLevelHint()
        setMsg('')
        el('adm-cancel').style.display = 'inline-block'
        el('adm-save').textContent = 'Сохранить'
        state.editing = true
      })
      .catch(function (e) {
        setMsg('Ошибка: ' + e.message, 'err')
      })
  }

  function updateLevelHint() {
    var lvl = el('f-level').value
    el('f-level-display').textContent = lvl ? ' (' + (LEVEL_LABEL[lvl] || lvl) + ')' : ''
  }

  // ---- сохранение (create/update) ----
  function save() {
    var rid = el('f-rid').value
    var payload = {
      slug: el('f-slug').value.trim(),
      title: el('f-title').value.trim(),
      h1: el('f-h1').value.trim() || undefined,
      level: el('f-level').value,
      parentRid: el('f-current-rid').value || null,
      description: el('f-description').value || undefined,
      content: el('f-content').value || undefined,
      image: el('f-image').value.trim() || undefined,
      is_hub: el('f-is_hub').checked,
      priority: el('f-priority').value ? parseFloat(el('f-priority').value) : undefined,
      lat: el('f-lat').value ? parseFloat(el('f-lat').value) : undefined,
      lng: el('f-lng').value ? parseFloat(el('f-lng').value) : undefined,
      csrf: CSRF,
    }
    var isNew = !rid
    var url = isNew ? API + '/create' : API + '/' + encodeURIComponent(rid)
    var method = isNew ? 'POST' : 'PUT'
    setMsg('Сохранение…', 'info')
    fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (r) {
        return r.json().catch(function () {
          return {}
        })
          .then(function (j) {
            return { status: r.status, json: j }
          })
      })
      .then(function (out) {
        if (out.status >= 200 && out.status < 300 && out.json.done) {
          setMsg('Сохранено ✓', 'ok')
          setTimeout(function () {
            loadChildren(state.current)
            newNode()
          }, 400)
        } else {
          var err = out.json.errors
            ? JSON.stringify(out.json.errors)
            : out.json.error || 'HTTP ' + out.status
          setMsg('Ошибка: ' + err, 'err')
        }
      })
      .catch(function (e) {
        setMsg('Ошибка сети: ' + e.message, 'err')
      })
  }

  // ---- удаление ----
  function deleteNode(rid) {
    var n = state.children.find(function (x) {
      return String(x.rid) === String(rid)
    })
    var name = n ? n.title || n.slug : rid
    var msg = 'Удалить узел «' + name + '»?\nВложенные узлы останутся, но потеряют родителя (ребро PART_OF снимется).'
    if (!confirm(msg)) return
    fetch(API + '/' + encodeURIComponent(rid), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csrf: CSRF }),
    })
      .then(function (r) {
        return r.json()
      })
      .then(function (j) {
        if (j.done) {
          setMsg('Удалено', 'ok')
          loadChildren(state.current)
        } else setMsg('Ошибка удаления', 'err')
      })
      .catch(function (e) {
        setMsg('Ошибка сети: ' + e.message, 'err')
      })
  }

  // ---- helpers ----
  function setLoading(v) {
    if (v) el('adm-list').innerHTML = '<div class="adm-empty">Загрузка…</div>'
  }
  function setMsg(txt, type) {
    var m = el('adm-msg')
    m.textContent = txt
    m.className = 'adm-msg ' + (type || '')
  }

  // ---- события ----
  // навигация по клику на имя узла (›) или breadcrumb
  el('adm-crumbs').addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-go="crumb"]')
    if (!t) return
    ev.preventDefault()
    var rid = t.getAttribute('data-rid') || ''
    loadChildren(rid || null)
  })

  // список: клик по строке → войти; по кнопке → edit/del
  el('adm-list').addEventListener('click', function (ev) {
    var btn = ev.target.closest('button[data-act]')
    var item = ev.target.closest('.adm-item')
    if (!item) return
    var rid = item.getAttribute('data-rid')
    var go = ev.target.closest('.adm-item-go')
    if (go && !btn) {
      loadChildren(rid)
      return
    }
    if (btn) {
      var act = btn.getAttribute('data-act')
      ev.stopPropagation()
      if (act === 'edit') editNode(rid)
      else if (act === 'del') deleteNode(rid)
    }
  })

  el('adm-search').addEventListener('input', function () {
    renderList()
  })

  el('adm-add').onclick = function () {
    newNode()
    el('f-title').focus()
  }
  el('adm-save').onclick = function () {
    save()
  }
  el('adm-cancel').onclick = function () {
    newNode()
  }
  el('f-level').onchange = updateLevelHint

  // ---- старт ----
  loadChildren(null)
})()
