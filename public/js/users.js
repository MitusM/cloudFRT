"use strict";
(self["webpackChunkcloudFRT"] = self["webpackChunkcloudFRT"] || []).push([["users"],{

/***/ "./microservices/users/assets/scss/index.scss"
/*!****************************************************!*\
  !*** ./microservices/users/assets/scss/index.scss ***!
  \****************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
// extracted by mini-css-extract-plugin


/***/ },

/***/ "./microservices/users/assets/js/index.js"
/*!************************************************!*\
  !*** ./microservices/users/assets/js/index.js ***!
  \************************************************/
(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony import */ var _scss_index_scss__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../scss/index.scss */ "./microservices/users/assets/scss/index.scss");
/* harmony import */ var nanoid__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! nanoid */ "./node_modules/nanoid/index.browser.js");
/* harmony import */ var preloader_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! preloader-js */ "./node_modules/preloader-js/preloader.js");


(async () => {
  let doc = document
  doc.addEventListener('DOMContentLoaded', () => {
    preloader_js__WEBPACK_IMPORTED_MODULE_2__.hide()
    /** url добавить пользователя */
    let urlUserAdd = doc.getElementById('url-user-add')
    /** контейнер с формой добавить пользователя */
    let divAddForm = doc.getElementById('user-add')
    /** форма добавить пользователя*/
    // let userAddForm = doc.querySelector(".user-form__add");
    /** кнопка закрыть форму добавления пользователя */
    let closeUserForm = doc.querySelector('.user-form-title__close')
    /** Таблица пользователей */
    let userTables = doc.querySelector('.user-table')
    /** class css display none  */
    let displayNone = 'display-none'
    /**  */
    let formAdd = new _$.Form('user-form')
    /**  */
    let elements = formAdd._form.elements
    /** Языковые константы при провале валидации */
    let langError = lang.errorAdmin
    /**  */
    let userTableBody = userTables.children[1]
    /**  */
    let ulUserTableBody = document.getElementById('user-list')
    /**  */
    let lastRid = userTableBody.dataset.lastRid
    /** Заголовок формы добавления или редактирования пользователя */
    let userFormTitle = document.querySelector('.user-form-add__title')
    /** Элементы формы добавления или редактирования пользователя */
    let hidden = elements[0]
    let _id = elements[1]
    let username = elements[3]
    let email = elements[4]
    let password = elements[5]
    let group = elements[6]
    let quota = elements[7]
    let submit = elements[8]
    let rid
    /** Модальное окно удаления пользователя  */
    let dialog = new _$.Dialog('#dialog')
    let csrf = document
      .querySelector('meta[name=csrf-token]')
      .getAttributeNode('content').value

    /**
     * Всплывающее сообщение.
     * @param {string} body Сообщение
     */
    let message = (action, body) => {
      _$.message(action, {
        title: action === 'error' ? 'Ошибка' : 'Завершенное',
        message: body,
        position: 'topCenter',
      })
    }

    /** Показываем или скрываем форму добавления пользователя */
    let toggleFormAdd = () => {
      divAddForm.classList.toggle(displayNone)
      divAddForm.classList.add('animate__zoomIn')
      /** Очищаем форму от данных */
      formAdd._form.reset()
      if (userTables.classList.contains('animate__fadeOut')) {
        userTables.classList.remove('animate__fadeOut')
        userTables.classList.toggle('display-none')
      } else {
        userTables.classList.add('animate__fadeOut')
        userTables.classList.toggle('display-none')
      }
    }

    /**  */
    const validateFields = (field, body) => {
      message('error', body)
      field.focus()
    }

    /** Обновляем данные пользователя */
    let update = () => {
      let user = username.value,
        emailUpdated = email.value

      if (user === '') validateFields(username, langError.username)
      if (emailUpdated === '') validateFields(email, langError.email)
      if (user && email) {
        preloader_js__WEBPACK_IMPORTED_MODULE_2__.show()
        if (user)
          axios
            .put('/users/update', {
              username: user,
              email: emailUpdated,
              password: password.value,
              group: group.value,
              quota: quota.value,
              id: _id.value,
              csrf: csrf,
              rid: rid,
            })
            .then((res) => {
              let data = res.data
              let id
              let dataObj
              preloader_js__WEBPACK_IMPORTED_MODULE_2__.hide()
              if (data.status === 201) {
                dataObj = data.user
                message('success', 'Your account has been updated')
                /** Скрываем форму добавления пользователя*/
                toggleFormAdd()
                /** Находим id добавляемого элемента в таблицу для анимации */
                id = doc.getElementById(data.id)
                let keys = Object.keys(dataObj)
                keys.forEach((value) => {
                  let v = dataObj[value]
                  let txt = id.querySelector('[data-class="' + value + '"]')
                  if (value === 'quota') {
                    v = _$.gb(v, 2, true)
                  }
                  if (txt) txt.innerText = v
                })
                /** Добавляем class к элементу для анимации */
                id.classList.add('animate__zoomIn')
                rid = ''
              } else {
                message('error', data.message)
              }
            })
            .catch((err) => console.error(err))
      }
    }
    /** Добавляем пользователя */
    let add = () => {
      let user = username.value,
        pass = password.value
      if (user === '') validateFields(username, langError.username)
      if (pass === '') validateFields(password, langError.password)
      if (user !== '' && pass !== '') {
        preloader_js__WEBPACK_IMPORTED_MODULE_2__.show()
        axios
          .put('/users/create', {
            username: user,
            email: email.value,
            password: pass,
            group: group.value,
            quota: quota.value,
            id: (0,nanoid__WEBPACK_IMPORTED_MODULE_1__.nanoid)(),
            csrf: csrf,
          })
          .then((res) => {
            preloader_js__WEBPACK_IMPORTED_MODULE_2__.hide()
            let data = res.data
            let id
            if (data.status === 201) {
              message('success', 'Your account has been created')
              /** Скрываем форму добавления пользователя*/
              toggleFormAdd()
              /** Добавляем данные о пользователе в таблицу */
              userTableBody.insertAdjacentHTML('afterbegin', data.html)
              /** Находим id добавляемого элемента в таблицу для анимации */
              id = doc.getElementById(data.id)
              /** Добавляем class к элементу для анимации */
              id.classList.add('animate__zoomIn')
            } else {
              message('error', data.message)
            }
          })
          .catch((err) => {
            console.log('⚡ err::', err)
          })
      }
    }

    /**
     * Редактирование данных пользователя:
     * Заполняем данными форму.
     * @user {object} Данные пользователя
     */
    const editUser = (user) => {
      userFormTitle.textContent = 'Редактировать пользователя'
      toggleFormAdd()
      hidden.value = 'update'
      _id.value = user._id
      username.value = user.username
      email.value = user.email
      quota.value = _$.gb(user.quota)
      group.value = user.group
      rid = user.rid
    }

    /** Удаляем пользователя */
    const deleteUser = (user) => {
      preloader_js__WEBPACK_IMPORTED_MODULE_2__.show()
      let rid = user.rid
      let id = user._id
      dialog.header('Удалить пользователя').show((bool) => {
        if (bool === 'true') {
          axios
            .put('/users/delete/' + id, { rid: rid, csrf: csrf })
            .then((res) => {
              preloader_js__WEBPACK_IMPORTED_MODULE_2__.hide()
              if (res.data.status === 201) {
                dialog.close()
                let el = document.getElementById(id)
                el.classList.add('animate__fadeOutLeft')
                setTimeout(() => {
                  el.remove()
                }, 500)
                // Пользователь успешно удалён
                message('success', 'The user has been successfully removed')
              }
            })
            .catch((err) => {
              console.log('⚡ err::', err)
              return err
            })
        }
      })
    }

    /** Блокируем или разблокируем пользователя */
    const userBan = (user, lock) => {
      preloader_js__WEBPACK_IMPORTED_MODULE_2__.show()
      // TODO: Для будущей совместимости
      let page = lock ? 'lock' : 'unlock'
      let id
      let s
      let data
      axios
        .put('/users/' + page + '-' + user._id + '.html', {
          rid: user.rid,
          lock: lock,
          csrf: csrf,
        })
        .then((res) => {
          preloader_js__WEBPACK_IMPORTED_MODULE_2__.hide()
          data = res.data
          if (data.status === 201 && data.count > 0) {
            id = doc.getElementById(user._id)
            s = id.querySelectorAll('[data-target="' + page + '"]')
            Array.prototype.slice.call(s, 0, s.length).forEach((el) => {
              if (el.classList.contains('unlock')) {
                el.classList.remove('unlock')
                el.classList.add('lock')
                _$.data(el, 'target', 'lock')
              } else {
                el.classList.remove('lock')
                el.classList.add('unlock')
                _$.data(el, 'target', 'unlock')
              }
            })
          } else {
          }
        })
        .catch((err) => {
          console.error(err)
          // TODO: handle errors
        })
    }

    /** Получаем с сервера данные пользователя */
    let getUser = (id, rid) => {
      return axios
        .post('/users/' + id, { rid: rid, csrf: csrf })
        .then((res) => {
          // TODO: Обработка данных пришедших с сервера, для исключения ошибок
          return res.data
        })
        .catch((err) => {
          console.error(err)
          // TODO: handle errors
          return err
        })
    }

    userTableBody.addEventListener('click', async (e) => {
      let target = e.target
      let task = target.dataset['target']
      let id = target.dataset['id']
      let rid = target.dataset['rid']
      let user = await getUser(id, rid)
      if (typeof user === 'string') {
        message('error', user)
      } else {
        switch (task) {
          case 'edit':
            editUser(user)
            break
          case 'trash':
            deleteUser(user)
            break
          case 'lock':
            userBan(user, true)
            break
          case 'unlock':
            userBan(user, false)
            break
          default:
            break
        }
      }
    })

    /** This function is called when the form is submitted*/
    submit.addEventListener('click', (e) => {
      e.preventDefault()
      return hidden.value === 'add' ? add() : update()
    })

    /**
     * Показываем или скрываем форму добавления пользователя
     */
    urlUserAdd.addEventListener('click', (e) => {
      e.preventDefault()
      userFormTitle.textContent = 'Добавить пользователя'
      hidden.value = 'add'
      toggleFormAdd()
    })

    /**
     * Скрываем форму добавления пользователя
     */
    closeUserForm.addEventListener('click', (e) => {
      toggleFormAdd()
    })

    // === === === === === === === === === === === ===
    // PAGINATE
    // === === === === === === === === === === === ===

    let page = 1
    // let total = 10

    function getDocumentHeight() {
      const body = document.body
      const html = document.documentElement

      return Math.max(
        body.scrollHeight,
        body.offsetHeight,
        html.clientHeight,
        html.scrollHeight,
        html.offsetHeight,
      )
    }

    function getScrollTop() {
      return window.pageYOffset !== undefined
        ? window.pageYOffset
        : (
            document.documentElement ||
            document.body.parentNode ||
            document.body
          ).scrollTop
    }

    let addPage = async (num) => {
      preloader_js__WEBPACK_IMPORTED_MODULE_2__.show()
      axios
        .post('/users/page-' + num, { rid: lastRid, csrf: csrf })
        .then((res) => {
          preloader_js__WEBPACK_IMPORTED_MODULE_2__.hide()
          let data = res.data
          if (data.status === 200 && data.total > 0) {
            // total += data.total
            lastRid = data.last
            ulUserTableBody.insertAdjacentHTML('beforeend', data.page)
            let li = ulUserTableBody.querySelector(
              '[data-number="' + num + '"]',
            )
            li.classList.add('animate__zoomInDown')
          } else {
            message('success', 'Все пользователи загружены')
            window.removeEventListener('scroll', onScroll, false)
          }
        })
        .catch((err) => {
          console.log('⚡ err::', err)
        })
    }

    let onScroll = () => {
      if (getScrollTop() < getDocumentHeight() - window.innerHeight) return
      addPage(++page)
    }

    window.addEventListener('scroll', onScroll, false)
  })
})()


/***/ }

},
/******/ __webpack_require__ => { // webpackRuntimeModules
/******/ var __webpack_exec__ = (moduleId) => (__webpack_require__(moduleId))
/******/ __webpack_require__.O(0, ["vendors"], () => (__webpack_exec__("./microservices/users/assets/js/index.js")));
/******/ var __webpack_exports__ = __webpack_require__.O();
/******/ }
]);