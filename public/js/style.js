"use strict";
(self["webpackChunkcloudFRT"] = self["webpackChunkcloudFRT"] || []).push([["style"],{

/***/ "./assets/js/core/gb.js"
/*!******************************!*\
  !*** ./assets/js/core/gb.js ***!
  \******************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   formatBytes: () => (/* binding */ formatBytes)
/* harmony export */ });
function formatBytes(bytes, decimals = 2, txt = false) {
  if (bytes === 0) return '0 Bytes'

  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']

  const i = Math.floor(Math.log(bytes) / Math.log(k))
  // let s = sizes[i % sizes.]
  let s = txt ? sizes[i] : ''

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + s //+ ' ' + sizes[i]
}


/***/ },

/***/ "./assets/js/form/index.js"
/*!*********************************!*\
  !*** ./assets/js/form/index.js ***!
  \*********************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/**
 *
 *
 */
class Form {
  constructor(selector, option) {
    this._form =
      typeof selector === "string"
        ? document.forms[selector]
        : typeof selector === "object"
        ? selector
        : null;
  }
}

/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (Form);


/***/ },

/***/ "./assets/js/index.js"
/*!****************************!*\
  !*** ./assets/js/index.js ***!
  \****************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony import */ var _scss_index_scss__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../scss/index.scss */ "./assets/scss/index.scss");
/* harmony import */ var tippy_js_dist_tippy_css__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! tippy.js/dist/tippy.css */ "./node_modules/tippy.js/dist/tippy.css");
/* harmony import */ var izitoast_dist_css_iziToast_css__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! izitoast/dist/css/iziToast.css */ "./node_modules/izitoast/dist/css/iziToast.css");
/* harmony import */ var tippy_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! tippy.js */ "./node_modules/tippy.js/dist/tippy.esm.js");
/* harmony import */ var delegate__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! delegate */ "./node_modules/delegate/src/delegate.js");
/* harmony import */ var delegate__WEBPACK_IMPORTED_MODULE_4___default = /*#__PURE__*/__webpack_require__.n(delegate__WEBPACK_IMPORTED_MODULE_4__);
/* harmony import */ var _system_each_js__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ./system/each.js */ "./assets/js/system/each.js");
/* harmony import */ var _system_extend_js__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ./system/extend.js */ "./assets/js/system/extend.js");
/* harmony import */ var _system_fetch_js__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ./system/fetch.js */ "./assets/js/system/fetch.js");
/* harmony import */ var _form_index_js__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! ./form/index.js */ "./assets/js/form/index.js");
/* harmony import */ var _system_message_js__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! ./system/message.js */ "./assets/js/system/message.js");
/* harmony import */ var _system_attribute_js__WEBPACK_IMPORTED_MODULE_10__ = __webpack_require__(/*! ./system/attribute.js */ "./assets/js/system/attribute.js");
/* harmony import */ var _core_gb_js__WEBPACK_IMPORTED_MODULE_11__ = __webpack_require__(/*! ./core/gb.js */ "./assets/js/core/gb.js");
/* harmony import */ var _modal_index_js__WEBPACK_IMPORTED_MODULE_12__ = __webpack_require__(/*! ./modal/index.js */ "./assets/js/modal/index.js");
























const _$ = {
  tippy: tippy_js__WEBPACK_IMPORTED_MODULE_3__["default"],
  extend: _system_extend_js__WEBPACK_IMPORTED_MODULE_6__.extend,
  each: _system_each_js__WEBPACK_IMPORTED_MODULE_5__.each,
  ajax: _system_fetch_js__WEBPACK_IMPORTED_MODULE_7__.ajax,
  delegate: (delegate__WEBPACK_IMPORTED_MODULE_4___default()),
  Form: _form_index_js__WEBPACK_IMPORTED_MODULE_8__["default"],
  message: _system_message_js__WEBPACK_IMPORTED_MODULE_9__["default"],
  data: _system_attribute_js__WEBPACK_IMPORTED_MODULE_10__.data,
  attr: _system_attribute_js__WEBPACK_IMPORTED_MODULE_10__.attr,
  gb: _core_gb_js__WEBPACK_IMPORTED_MODULE_11__.formatBytes,
  Dialog: _modal_index_js__WEBPACK_IMPORTED_MODULE_12__["default"],
}

window._$ = _$


/***/ },

/***/ "./assets/js/modal/index.js"
/*!**********************************!*\
  !*** ./assets/js/modal/index.js ***!
  \**********************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* global define */
/**
 * [[Description]]
 * Copyright (c) Wed Jan 31 2018 Mitus M.
 * Licensed under the Apache 2.0 license.
 */

const modal = (__webpack_require__(/*! dialog-polyfill */ "./node_modules/dialog-polyfill/dist/dialog-polyfill.esm.js")["default"])
// import modal from 'dialog-polyfill'
const init = Symbol()
const getElement = Symbol()
const promis = Symbol()

/**
 * @class Dialog
 * @classdesc [[Description]]
 */
class Dialog {
  /**
   * [[Description]]
   * @constructs [[Link]]
   * @param {string|object} elem [[Description]]
   */
  constructor(elem) {
    this.elem =
      typeof elem === 'string'
        ? document.querySelector(elem)
        : typeof elem === 'object'
        ? elem
        : null
    if (this.elem) this[init]()
  }

  /**
   * Получение элемента
   */
  get element() {
    return this.elem
  }

  /**
   * Задаём элемент который будет использован в виде модального или диалогового окна
   */
  set element(elem) {
    this.elem = elem
  }

  /**
   * Задаем заголовок диалогового или модального окна
   * @param   {string} text Текст заголовка
   * @param   {string} elem class или id, внутри диалогово или модального окна. Если не задан то будет находить по умолчанию .modal-title
   * @returns {object} this
   */
  header(text, elem) {
    elem = elem ? this[getElement](elem) : this[getElement]('.modal-title')
    elem.innerHTML = text
    return this
  }

  /**
   * Задаём текст диалогового или модального окна
   * @param   {string} text текст сообщения
   * @param   {string} elem class или id, внутри диалогово или модального окна. Если не задан то будет находить по умолчанию .modal-content
   * @returns {object} this
   */
  content(text, elem) {
    elem = elem ? this[getElement](elem) : this[getElement]('.modal-content')
    elem.innerHTML = text
    return this
  }

  /**
   * Показать модальное или диалоговое окно
   * @param   {function} fn функция которая должна быть выполнена в момент открытия диалогового окна
   * @returns {object}   this
   */
  // NOTE: Если не использовать Promise, то при каждом новом клике на кнопку происходит срабатывание предыдущих событий.
  show(cb) {
    this.elem.showModal()
    // document.querySelector('._dialog_overlay').addEventListener('click', this.close.bind(this))
    if (cb) {
      // cb(this.elem.returnValue)
      this[promis]().then((val) => {
        cb(val)
      })
    }
    return this
  }

  /**
   * Закрыть модальное или диалоговое окно
   */
  close() {
    if (this.elem.hasAttribute('open')) this.elem.close(false)
  }

  /**
   * Инициализация кнопки закрытия диалогового окна и закрытия по клику по затемнению
   * @returns {object} this
   */
  // TODO: Добавить выбор вывода окна show() или showModal(). Если showModal() то только тогда инициализация overlay 📌
  initClose() {
    this[getElement]('#modal-close').addEventListener(
      'click',
      this.close.bind(this),
    )
    return this
  }

  /**
   * Инициализация диалогового или модального окна
   * @private
   */
  [init]() {
    modal.registerDialog(this.elem)
  }

  /**
   * Находим элементы внутри диалогового окна
   * @param {string} selector class или id (.class | #id)
   * @private
   */
  [getElement](selector) {
    return this.elem.querySelector(selector)
  }

  /**
   * Promise
   * @private
   */
  [promis]() {
    return new Promise((resolve) => {
      this.elem.addEventListener('close', () => {
        // e.preventDefault()
        // e.stopImmediatePropagation()
        resolve(this.elem.returnValue)
      })
    })
  }
}
// window.Dialog = Dialog
// module.exports = Dialog
// if (typeof define === 'function' && define.amd) {
//   define('Dialog', [], function () {
//     return Dialog
//   })
// } else if (typeof exports !== 'undefined' && !exports.nodeType) {
//   if (typeof module !== 'undefined' && !module.nodeType && module.exports) {
//     // eslint-disable-next-line no-global-assign
//     exports = module.exports = Dialog
//   }
//   exports.default = Dialog
// }

/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (Dialog);


/***/ },

/***/ "./assets/js/system/attribute.js"
/*!***************************************!*\
  !*** ./assets/js/system/attribute.js ***!
  \***************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   attr: () => (/* binding */ attr),
/* harmony export */   data: () => (/* binding */ data)
/* harmony export */ });
function attr(element, options) {
  this.each(options, (elem, key) => {
    if (key === 'class') {
      element.classList.add(options.class)
    } else {
      element.setAttribute(key, elem)
    }
  })
  return this
}

/**
 * Создаём объект с данными, на основании всех (data-*) атрибутов элемента
 * @param   {object}        e    элемент на котором произошло событие
 * @param   {string}        attr не обязательный параметр, если указан то будет получено значение только данного атрибута Например: name
 * @param   {*}             val  не обязательный параметр, если он указан вместе с параметром attr то у переданного атрибута будет установлено значение val
 * @returns {object|string} Если передан один первый параметр(e) то получим данные
 */
function data(e, attr, val) {
  let element = e.target || e
  let data = !attr ? element.dataset : (!val ? element.dataset[attr] : element.dataset[attr] = val)
  return data
}

/***/ },

/***/ "./assets/js/system/each.js"
/*!**********************************!*\
  !*** ./assets/js/system/each.js ***!
  \**********************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   each: () => (/* binding */ each),
/* harmony export */   has: () => (/* binding */ has)
/* harmony export */ });
function has(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key)
}

const nativeForEach = Array.prototype.forEach
const breaker = {}

function each (obj, iterator, context) {
  if (obj == null) return
  if (nativeForEach && obj.forEach === nativeForEach) {
    obj.forEach(iterator, context)
  } else if (obj.length === +obj.length) {
    for (var i = 0, l = obj.length; i < l; i++) {
      if (iterator.call(context, obj[i], i, obj) === breaker) return
    }
  } else {
    for (var key in obj) {
      if (has(obj, key)) {
        if (iterator.call(context, obj[key], key, obj) === breaker) return
      }
    }
  }
}


/***/ },

/***/ "./assets/js/system/extend.js"
/*!************************************!*\
  !*** ./assets/js/system/extend.js ***!
  \************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   extend: () => (/* binding */ extend)
/* harmony export */ });
let extend = function () {
  let merged = {}
  Array.prototype.forEach.call(arguments, function (obj) {
    for (let key in obj) {
      // eslint-disable-next-line no-prototype-builtins
      if (!obj.hasOwnProperty(key)) return
      merged[key] = obj[key]
    }
  })
  return merged
}



/***/ },

/***/ "./assets/js/system/fetch.js"
/*!***********************************!*\
  !*** ./assets/js/system/fetch.js ***!
  \***********************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ajax: () => (/* binding */ ajax)
/* harmony export */ });
/*global _$*/

/**
 * Зависимости: _$.extend
 */
const defSettings = {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json;charset=utf-8'
  }
}

let initArguments = (options) => {
  return typeof options === 'function' || options === undefined ? defSettings : _$.extend(defSettings, options)
  // {
  // options:

  // }
}

function status(response) {
  if (response.status >= 200 && response.status < 300) {
    return Promise.resolve(response)
  } else {
    return Promise.reject(new Error(response.statusText))
  }
}

function json(response) {
  return response.json()
}

function ajax(url, options) {
  try {
    options = initArguments(options)
    return fetch(url, {
        method: options.method,
        headers: options.headers,
        body: JSON.stringify(options.body)
      })
      .then(status)
      .then(json)
      .then(data => {
        return data
      }).catch(error => error)
    // .catch(function (error) {
    //   console.log('Request failed', error);
    //   _$.message('error', {
    //     title: 'Ошибка',
    //     message: error,
    //     position: 'topCenter'
    //   })
    // })
  } catch (error) {
    return new Error('Неудачный запрос')
  }
}


/***/ },

/***/ "./assets/js/system/message.js"
/*!*************************************!*\
  !*** ./assets/js/system/message.js ***!
  \*************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var izitoast__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! izitoast */ "./node_modules/izitoast/dist/js/iziToast.js");
/* harmony import */ var izitoast__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(izitoast__WEBPACK_IMPORTED_MODULE_0__);
//📌


function message(action, settings, fn) {
    let obj = {
        position: settings.position || 'topRight'
    }
    if (fn) {
        obj.onClosing = function () {
            fn()
        }
    }
    // position: 'center', bottomRight, bottomLeft, topRight, topLeft, topCenter, bottomCenter
    for (const key in settings) {
        if (settings.hasOwnProperty(key)) {
            obj[key] = settings[key];
        }
    }
    ;(izitoast__WEBPACK_IMPORTED_MODULE_0___default())[action](obj)
}

/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (message);

/***/ },

/***/ "./assets/scss/index.scss"
/*!********************************!*\
  !*** ./assets/scss/index.scss ***!
  \********************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
// extracted by mini-css-extract-plugin


/***/ }

},
/******/ __webpack_require__ => { // webpackRuntimeModules
/******/ var __webpack_exec__ = (moduleId) => (__webpack_require__(moduleId))
/******/ __webpack_require__.O(0, ["vendors"], () => (__webpack_exec__("./assets/js/index.js")));
/******/ var __webpack_exports__ = __webpack_require__.O();
/******/ }
]);