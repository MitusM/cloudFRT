"use strict";
(self["webpackChunkcloudFRT"] = self["webpackChunkcloudFRT"] || []).push([["login"],{

/***/ "./microservices/auth/assets/scss/index.scss"
/*!***************************************************!*\
  !*** ./microservices/auth/assets/scss/index.scss ***!
  \***************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
// extracted by mini-css-extract-plugin


/***/ },

/***/ "./microservices/auth/assets/js/index.js"
/*!***********************************************!*\
  !*** ./microservices/auth/assets/js/index.js ***!
  \***********************************************/
(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony import */ var _scss_index_scss__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../scss/index.scss */ "./microservices/auth/assets/scss/index.scss");
/* harmony import */ var preloader_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! preloader-js */ "./node_modules/preloader-js/preloader.js");

(async (window) => {
  /**  */
  preloader_js__WEBPACK_IMPORTED_MODULE_1__.hide()
  let Login = new _$.Form('login_form')
  let elements = Login._form.elements
  let token = elements[1]
  let consumer = elements[2]
  let user = elements[3]
  let password = elements[4]
  let submit = elements[5]
  let csrf = document
    .querySelector('meta[name=csrf-token]')
    .getAttributeNode('content').value
  token.value = csrf
  let message = (body) => {
    _$.message('error', {
      title: 'Ошибка',
      message: body,
      position: 'topCenter',
    })
  }

  submit.addEventListener('click', (e) => {
    e.preventDefault()
    preloader_js__WEBPACK_IMPORTED_MODULE_1__.show()
    let target = e.target
    let usrVal = user.value
    let pswVal = password.value
    let obj = {
      username: usrVal,
      csrf: token.value,
      password: pswVal,
    }

    if (usrVal === '') {
      validateFields(user, 'Укажите логин')
      user.focus()
    }
    if (pswVal === '') {
      validateFields(password, 'Укажите пароль')
      password.focus()
    }

    if (usrVal !== '' && pswVal !== '') {
      // submit.disabled = true;
      axios
        .post('/auth/signin', {
          username: usrVal,
          csrf: token.value,
          password: pswVal,
          consumer: consumer.value,
        })
        .then(function (response) {
          preloader_js__WEBPACK_IMPORTED_MODULE_1__.hide()
          let data = response.data
          if (data.status === 204 || data.status === 203) {
            message(data.message)
          }
          if (data.status === 200) {
            submit.disabled = true
            window.location.replace(data.location)
          }
        })
        .catch(function (error) {
          console.log(error)
        })
    }
  })

  const validateFields = (field, body) => {
    // if (field === "") {
    message(body)
    field.focus()
    // }
  }
})(window)


/***/ }

},
/******/ __webpack_require__ => { // webpackRuntimeModules
/******/ var __webpack_exec__ = (moduleId) => (__webpack_require__(moduleId))
/******/ __webpack_require__.O(0, ["vendors"], () => (__webpack_exec__("./microservices/auth/assets/js/index.js")));
/******/ var __webpack_exports__ = __webpack_require__.O();
/******/ }
]);