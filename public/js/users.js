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
/* harmony import */ var _babel_runtime_helpers_asyncToGenerator__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @babel/runtime/helpers/asyncToGenerator */ "./node_modules/@babel/runtime/helpers/esm/asyncToGenerator.js");
/* harmony import */ var _babel_runtime_regenerator__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! @babel/runtime/regenerator */ "./node_modules/@babel/runtime/regenerator/index.js");
/* harmony import */ var _scss_index_scss__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../scss/index.scss */ "./microservices/users/assets/scss/index.scss");
/* harmony import */ var nanoid__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! nanoid */ "./node_modules/nanoid/index.browser.js");
/* harmony import */ var dropzone__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! dropzone */ "./node_modules/dropzone/dist/dropzone.js");
/* harmony import */ var preloader_js__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! preloader-js */ "./node_modules/preloader-js/preloader.js");






(0,_babel_runtime_helpers_asyncToGenerator__WEBPACK_IMPORTED_MODULE_0__["default"])(/*#__PURE__*/_babel_runtime_regenerator__WEBPACK_IMPORTED_MODULE_1__.mark(function _callee3() {
  var doc;
  return _babel_runtime_regenerator__WEBPACK_IMPORTED_MODULE_1__.wrap(function _callee3$(_context3) {
    while (1) switch (_context3.prev = _context3.next) {
      case 0:
        doc = document;
        doc.addEventListener('DOMContentLoaded', function () {
          preloader_js__WEBPACK_IMPORTED_MODULE_5__.hide();
          /** url добавить пользователя */
          var urlUserAdd = doc.getElementById('url-user-add');
          /** контейнер с формой добавить пользователя */
          var divAddForm = doc.getElementById('user-add');
          /** форма добавить пользователя*/
          // let userAddForm = doc.querySelector(".user-form__add");
          /** кнопка закрыть форму добавления пользователя */
          var closeUserForm = doc.querySelector('.user-form-title__close');
          /** Таблица пользователей */
          var userTables = doc.querySelector('.user-table');
          /** class css display none  */
          var displayNone = 'display-none';
          /**  */
          var formAdd = new _$.Form('user-form');
          /**  */
          var elements = formAdd._form.elements;
          /** Языковые константы при провале валидации */
          var langError = lang.errorAdmin;
          /**  */
          var userTableBody = userTables.children[1];
          /**  */
          var ulUserTableBody = document.getElementById('user-list');
          /**  */
          var lastRid = userTableBody.dataset.lastRid;
          /** Заголовок формы добавления или редактирования пользователя */
          var userFormTitle = document.querySelector('.user-form-add__title');
          /** Элементы формы добавления или редактирования пользователя */
          var hidden = elements[0];
          var _id = elements[1];
          var username = elements[3];
          var email = elements[4];
          var password = elements[5];
          var group = elements[6];
          var quota = elements[7];
          var submit = elements[8];
          var rid;
          /** Модальное окно удаления пользователя  */
          var dialog = new _$.Dialog('#dialog');
          var csrf = document.querySelector('meta[name=csrf-token]').getAttributeNode('content').value;

          /**
           * Всплывающее сообщение.
           * @param {string} body Сообщение
           */
          var message = function message(action, body) {
            _$.message(action, {
              title: action === 'error' ? 'Ошибка' : 'Завершенное',
              message: body,
              position: 'topCenter'
            });
          };

          /** Показываем или скрываем форму добавления пользователя */
          var toggleFormAdd = function toggleFormAdd() {
            divAddForm.classList.toggle(displayNone);
            divAddForm.classList.add('animate__zoomIn');
            /** Очищаем форму от данных */
            formAdd._form.reset();
            if (userTables.classList.contains('animate__fadeOut')) {
              userTables.classList.remove('animate__fadeOut');
              userTables.classList.toggle('display-none');
            } else {
              userTables.classList.add('animate__fadeOut');
              userTables.classList.toggle('display-none');
            }
          };

          /**  */
          var validateFields = function validateFields(field, body) {
            message('error', body);
            field.focus();
          };

          /** Обновляем данные пользователя */
          var update = function update() {
            var user = username.value,
              emailUpdated = email.value;
            if (user === '') validateFields(username, langError.username);
            if (emailUpdated === '') validateFields(email, langError.email);
            if (user && email) {
              preloader_js__WEBPACK_IMPORTED_MODULE_5__.show();
              if (user) axios.put('/users/update', {
                username: user,
                email: emailUpdated,
                password: password.value,
                group: group.value,
                quota: quota.value,
                id: _id.value,
                csrf: csrf,
                rid: rid
              }).then(function (res) {
                var data = res.data;
                var id;
                var dataObj;
                preloader_js__WEBPACK_IMPORTED_MODULE_5__.hide();
                if (data.status === 201) {
                  dataObj = data.user;
                  message('success', 'Your account has been updated');
                  /** Скрываем форму добавления пользователя*/
                  toggleFormAdd();
                  /** Находим id добавляемого элемента в таблицу для анимации */
                  id = doc.getElementById(data.id);
                  var keys = Object.keys(dataObj);
                  keys.forEach(function (value) {
                    var v = dataObj[value];
                    var txt = id.querySelector('[data-class="' + value + '"]');
                    if (value === 'quota') {
                      v = _$.gb(v, 2, true);
                    }
                    if (txt) txt.innerText = v;
                  });
                  /** Добавляем class к элементу для анимации */
                  id.classList.add('animate__zoomIn');
                  rid = '';
                } else {
                  message('error', data.message);
                }
              })["catch"](function (err) {
                return console.error(err);
              });
            }
          };
          /** Добавляем пользователя */
          var add = function add() {
            var user = username.value,
              pass = password.value;
            if (user === '') validateFields(username, langError.username);
            if (pass === '') validateFields(password, langError.password);
            if (user !== '' && pass !== '') {
              preloader_js__WEBPACK_IMPORTED_MODULE_5__.show();
              axios.put('/users/create', {
                username: user,
                email: email.value,
                password: pass,
                group: group.value,
                quota: quota.value,
                id: (0,nanoid__WEBPACK_IMPORTED_MODULE_3__.nanoid)(),
                csrf: csrf
              }).then(function (res) {
                preloader_js__WEBPACK_IMPORTED_MODULE_5__.hide();
                var data = res.data;
                var id;
                if (data.status === 201) {
                  message('success', 'Your account has been created');
                  /** Скрываем форму добавления пользователя*/
                  toggleFormAdd();
                  /** Добавляем данные о пользователе в таблицу */
                  userTableBody.insertAdjacentHTML('afterbegin', data.html);
                  /** Находим id добавляемого элемента в таблицу для анимации */
                  id = doc.getElementById(data.id);
                  /** Добавляем class к элементу для анимации */
                  id.classList.add('animate__zoomIn');
                } else {
                  message('error', data.message);
                }
              })["catch"](function (err) {
                console.log('⚡ err::', err);
              });
            }
          };

          /**
           * Редактирование данных пользователя:
           * Заполняем данными форму.
           * @user {object} Данные пользователя
           */
          var editUser = function editUser(user) {
            userFormTitle.textContent = 'Редактировать пользователя';
            toggleFormAdd();
            hidden.value = 'update';
            _id.value = user._id;
            username.value = user.username;
            email.value = user.email;
            quota.value = _$.gb(user.quota);
            group.value = user.group;
            rid = user.rid;
          };

          /** Удаляем пользователя */
          var deleteUser = function deleteUser(user) {
            preloader_js__WEBPACK_IMPORTED_MODULE_5__.show();
            var rid = user.rid;
            var id = user._id;
            dialog.header('Удалить пользователя').show(function (bool) {
              if (bool === 'true') {
                axios.put('/users/delete/' + id, {
                  rid: rid,
                  csrf: csrf
                }).then(function (res) {
                  preloader_js__WEBPACK_IMPORTED_MODULE_5__.hide();
                  if (res.data.status === 201) {
                    dialog.close();
                    var el = document.getElementById(id);
                    el.classList.add('animate__fadeOutLeft');
                    setTimeout(function () {
                      el.remove();
                    }, 500);
                    // Пользователь успешно удалён
                    message('success', 'The user has been successfully removed');
                  }
                })["catch"](function (err) {
                  console.log('⚡ err::', err);
                  return err;
                });
              }
            });
          };

          /** Блокируем или разблокируем пользователя */
          var userBan = function userBan(user, lock) {
            preloader_js__WEBPACK_IMPORTED_MODULE_5__.show();
            // TODO: Для будущей совместимости
            var page = lock ? 'lock' : 'unlock';
            var id;
            var s;
            var data;
            axios.put('/users/' + page + '-' + user._id + '.html', {
              rid: user.rid,
              lock: lock,
              csrf: csrf
            }).then(function (res) {
              preloader_js__WEBPACK_IMPORTED_MODULE_5__.hide();
              data = res.data;
              if (data.status === 201 && data.count > 0) {
                id = doc.getElementById(user._id);
                s = id.querySelectorAll('[data-target="' + page + '"]');
                Array.prototype.slice.call(s, 0, s.length).forEach(function (el) {
                  if (el.classList.contains('unlock')) {
                    el.classList.remove('unlock');
                    el.classList.add('lock');
                    _$.data(el, 'target', 'lock');
                  } else {
                    el.classList.remove('lock');
                    el.classList.add('unlock');
                    _$.data(el, 'target', 'unlock');
                  }
                });
              } else {}
            })["catch"](function (err) {
              console.error(err);
              // TODO: handle errors
            });
          };

          /** Получаем с сервера данные пользователя */
          var getUser = function getUser(id, rid) {
            return axios.post('/users/' + id, {
              rid: rid,
              csrf: csrf
            }).then(function (res) {
              // TODO: Обработка данных пришедших с сервера, для исключения ошибок
              return res.data;
            })["catch"](function (err) {
              console.error(err);
              // TODO: handle errors
              return err;
            });
          };
          userTableBody.addEventListener('click', /*#__PURE__*/function () {
            var _ref2 = (0,_babel_runtime_helpers_asyncToGenerator__WEBPACK_IMPORTED_MODULE_0__["default"])(/*#__PURE__*/_babel_runtime_regenerator__WEBPACK_IMPORTED_MODULE_1__.mark(function _callee(e) {
              var target, task, id, rid, user;
              return _babel_runtime_regenerator__WEBPACK_IMPORTED_MODULE_1__.wrap(function _callee$(_context) {
                while (1) switch (_context.prev = _context.next) {
                  case 0:
                    target = e.target;
                    task = target.dataset['target'];
                    id = target.dataset['id'];
                    rid = target.dataset['rid'];
                    _context.next = 6;
                    return getUser(id, rid);
                  case 6:
                    user = _context.sent;
                    if (!(typeof user === 'string')) {
                      _context.next = 11;
                      break;
                    }
                    message('error', user);
                    _context.next = 23;
                    break;
                  case 11:
                    _context.t0 = task;
                    _context.next = _context.t0 === 'edit' ? 14 : _context.t0 === 'trash' ? 16 : _context.t0 === 'lock' ? 18 : _context.t0 === 'unlock' ? 20 : 22;
                    break;
                  case 14:
                    editUser(user);
                    return _context.abrupt("break", 23);
                  case 16:
                    deleteUser(user);
                    return _context.abrupt("break", 23);
                  case 18:
                    userBan(user, true);
                    return _context.abrupt("break", 23);
                  case 20:
                    userBan(user, false);
                    return _context.abrupt("break", 23);
                  case 22:
                    return _context.abrupt("break", 23);
                  case 23:
                  case "end":
                    return _context.stop();
                }
              }, _callee);
            }));
            return function (_x) {
              return _ref2.apply(this, arguments);
            };
          }());

          /** This function is called when the form is submitted*/
          submit.addEventListener('click', function (e) {
            e.preventDefault();
            return hidden.value === 'add' ? add() : update();
          });

          /**
           * Показываем или скрываем форму добавления пользователя
           */
          urlUserAdd.addEventListener('click', function (e) {
            e.preventDefault();
            userFormTitle.textContent = 'Добавить пользователя';
            hidden.value = 'add';
            toggleFormAdd();
          });

          /**
           * Скрываем форму добавления пользователя
           */
          closeUserForm.addEventListener('click', function (e) {
            toggleFormAdd();
          });

          // === === === === === === === === === === === ===
          // PAGINATE
          // === === === === === === === === === === === ===

          var page = 1;
          // let total = 10

          function getDocumentHeight() {
            var body = document.body;
            var html = document.documentElement;
            return Math.max(body.scrollHeight, body.offsetHeight, html.clientHeight, html.scrollHeight, html.offsetHeight);
          }
          function getScrollTop() {
            return window.pageYOffset !== undefined ? window.pageYOffset : (document.documentElement || document.body.parentNode || document.body).scrollTop;
          }
          var addPage = /*#__PURE__*/function () {
            var _ref3 = (0,_babel_runtime_helpers_asyncToGenerator__WEBPACK_IMPORTED_MODULE_0__["default"])(/*#__PURE__*/_babel_runtime_regenerator__WEBPACK_IMPORTED_MODULE_1__.mark(function _callee2(num) {
              return _babel_runtime_regenerator__WEBPACK_IMPORTED_MODULE_1__.wrap(function _callee2$(_context2) {
                while (1) switch (_context2.prev = _context2.next) {
                  case 0:
                    preloader_js__WEBPACK_IMPORTED_MODULE_5__.show();
                    axios.post('/users/page-' + num, {
                      rid: lastRid,
                      csrf: csrf
                    }).then(function (res) {
                      preloader_js__WEBPACK_IMPORTED_MODULE_5__.hide();
                      var data = res.data;
                      if (data.status === 200 && data.total > 0) {
                        // total += data.total
                        lastRid = data.last;
                        ulUserTableBody.insertAdjacentHTML('beforeend', data.page);
                        var li = ulUserTableBody.querySelector('[data-number="' + num + '"]');
                        li.classList.add('animate__zoomInDown');
                      } else {
                        message('success', 'Все пользователи загружены');
                        window.removeEventListener('scroll', onScroll, false);
                      }
                    })["catch"](function (err) {
                      console.log('⚡ err::', err);
                    });
                  case 2:
                  case "end":
                    return _context2.stop();
                }
              }, _callee2);
            }));
            return function addPage(_x2) {
              return _ref3.apply(this, arguments);
            };
          }();
          var onScroll = function onScroll() {
            if (getScrollTop() < getDocumentHeight() - window.innerHeight) return;
            addPage(++page);
          };
          window.addEventListener('scroll', onScroll, false);
        });
      case 2:
      case "end":
        return _context3.stop();
    }
  }, _callee3);
}))();

/***/ }

},
/******/ __webpack_require__ => { // webpackRuntimeModules
/******/ var __webpack_exec__ = (moduleId) => (__webpack_require__(__webpack_require__.s = moduleId))
/******/ __webpack_require__.O(0, ["vendors"], () => (__webpack_exec__("./microservices/users/assets/js/index.js")));
/******/ var __webpack_exports__ = __webpack_require__.O();
/******/ }
]);