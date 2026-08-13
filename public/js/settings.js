"use strict";
(self["webpackChunkcloudFRT"] = self["webpackChunkcloudFRT"] || []).push([["settings"],{

/***/ "./microservices/users/assets/js/settings.js"
/*!***************************************************!*\
  !*** ./microservices/users/assets/js/settings.js ***!
  \***************************************************/
(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony import */ var _babel_runtime_helpers_asyncToGenerator__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @babel/runtime/helpers/asyncToGenerator */ "./node_modules/@babel/runtime/helpers/esm/asyncToGenerator.js");
/* harmony import */ var _babel_runtime_regenerator__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! @babel/runtime/regenerator */ "./node_modules/@babel/runtime/regenerator/index.js");


;
(0,_babel_runtime_helpers_asyncToGenerator__WEBPACK_IMPORTED_MODULE_0__["default"])(/*#__PURE__*/_babel_runtime_regenerator__WEBPACK_IMPORTED_MODULE_1__.mark(function _callee2() {
  var doc;
  return _babel_runtime_regenerator__WEBPACK_IMPORTED_MODULE_1__.wrap(function _callee2$(_context2) {
    while (1) switch (_context2.prev = _context2.next) {
      case 0:
        doc = document; // Settings
        doc.addEventListener('DOMContentLoaded', /*#__PURE__*/(0,_babel_runtime_helpers_asyncToGenerator__WEBPACK_IMPORTED_MODULE_0__["default"])(/*#__PURE__*/_babel_runtime_regenerator__WEBPACK_IMPORTED_MODULE_1__.mark(function _callee() {
          var formAdd, elementForm, submit, csrf, message;
          return _babel_runtime_regenerator__WEBPACK_IMPORTED_MODULE_1__.wrap(function _callee$(_context) {
            while (1) switch (_context.prev = _context.next) {
              case 0:
                /** Add settings form for id  */
                formAdd = new _$.Form('form__add'); // console.log('⚡ formAdd::', formAdd._form)
                elementForm = formAdd._form.elements; // console.log('⚡ elementForm::', elementForm)
                /** Элементы формы добавления или редактирования пользователя */
                submit = elementForm[3];
                csrf = document.querySelector('meta[name=csrf-token]').getAttributeNode('content').value;
                /**
                 * Всплывающее сообщение.
                 * @param {string} body Сообщение
                 */
                message = function message(action, body) {
                  _$.message(action, {
                    title: action === 'error' ? 'Ошибка' : 'Завершенное',
                    message: body,
                    position: 'topCenter'
                  });
                };
                submit.addEventListener('click', function (e) {
                  e.preventDefault();
                  var limit = elementForm[0].value;
                  var quota = elementForm[1].value;
                  var cache = elementForm[2].checked;
                  axios.put('/users/settings', {
                    limit: limit,
                    quota: quota,
                    cache: cache,
                    csrf: csrf
                  }).then(function (res) {
                    var data = res.data;
                    var mess = '';
                    console.log('⚡ data::', data);
                    /** Успешное выполнение операций. Если пришёл ответ со статусом 201. Все остальные ошибка */
                    if (data.status === 201) {
                      if (data.message.bd === 1) {
                        mess += 'Данные успешно добавлены в Базу Данных! </br>';
                      }
                      if (data.message.redis === 1) {
                        mess += 'Настройки успешно сохранены в Redis! </br>';
                      }
                      if (data.message.cache === 1) {
                        mess += 'Кэш успешно обновлён!';
                      }
                      message('success', mess);
                    } else {}
                  })["catch"](function (err) {
                    console.log('⚡ err::', err);
                  });
                });
              case 6:
              case "end":
                return _context.stop();
            }
          }, _callee);
        })));
      case 2:
      case "end":
        return _context2.stop();
    }
  }, _callee2);
}))();

/***/ }

},
/******/ __webpack_require__ => { // webpackRuntimeModules
/******/ var __webpack_exec__ = (moduleId) => (__webpack_require__(__webpack_require__.s = moduleId))
/******/ __webpack_require__.O(0, ["vendors"], () => (__webpack_exec__("./microservices/users/assets/js/settings.js")));
/******/ var __webpack_exports__ = __webpack_require__.O();
/******/ }
]);