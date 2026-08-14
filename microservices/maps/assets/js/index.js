import '../scss/index.scss'
import { nanoid } from 'nanoid'
import CyrillicToTranslit from 'cyrillic-to-translit-js'
import tp from './typograf/index.js'
import { htmlFormatting, validElements } from './html-formatting/index.js'
import { picture } from './upload/picture.js'
import inputFilter from './input-filter.js'
import preloader from 'preloader-js'

// === === === === === === === === === === === ===
//
// === === === === === === === === === === === ===
;(async () => {
  let doc = document
  preloader.hide()
  doc.addEventListener('DOMContentLoaded', () => {
    const lang = {
      ru: {
        dropzone:
          'Перетащите изображения в данную область и отпустите, или кликните по ней для начала загрузки изображения.',
        message: {
          error: {
            title: 'Во время загрузки произошла ошибка.',
            success: 'Сервер не смог загрузить изображение, попробуйте позже.',
          },
          success: {
            title: '',
            done: 'Загрузка прошла успешно.',
          },
          limit: {
            title: '!!!!',
            body: 'Превышен лимит по количеству изображений доступных для загрузки.',
          },
          delete: {
            title: '',
            body: 'Файл успешно удалён.',
          },
        },
        save: {
          required: 'Обязательно для заполнения',
          error: {
            title: 'Не указан заголовок статьи',
            location: 'Не указаны географические координаты',
            country: 'Не выбрана страна',
            region: 'Не выбран регион (область, край и т.д.',
            city: 'Не выбран город поселок, село и т.д.',
          },
          success: {
            title: '',
            message: 'Страна добавлена',
          },
        },
        error: {
          country: 'Перед созданием заголовка, выберете страну',
        },
      },
    }
    /** lang SAVE */
    const save = lang.ru.save
    const message = lang.ru.message
    const position = 'topRight'
    let maxfilesexceeded = false

    const cyrillicToTranslit = new CyrillicToTranslit()
    /** Add settings form for id  */
    let formAdd = new _$.Form('add')
    let elementForm = formAdd._form.elements
    /** Поле ввода название страны */
    let titleInput = elementForm.title
    /** url */
    let urlInput = elementForm.url
    /** Название папки в которую загружаются изображения, используемые в статье */
    let folder = elementForm.folder
    /** Сколько всего загруженно изображений */
    let totalInput = elementForm.total
    /**  */
    let bodyEditor
    /** Счётчик сколько всего загруженно изображений */
    let count = 0
    /** Элемент на странице в котором отображаем количество загруженных изображений */
    let total = doc.getElementById('js-count')
    /** CSRF protection value */
    const csrf = document
      .querySelector('meta[name=csrf-token]')
      .getAttributeNode('content').value
    /** Контейнер с dropzone */
    let dropZoneForm
    /** Кнопка закрытия dropzone */
    let divCloseDropZone
    /** css class position dropzone */
    let positionDropAbsolute = 'dropzone-absolute'
    /** Зона затемнения вокруг dropzone, для фокусировки внимания  */
    let wrapper = doc.querySelector('.wrapper-dropzone')
    /** Кнопка добавить статью. */
    let submit = doc.getElementById('submit')
    // let imgUpload = []
    let imgUpload = {}
    /** Выбор страны */
    const countryField = elementForm.country
    /** Регионы */
    const regionField = elementForm.region
    /** Города */
    const cityField = elementForm.city
    const main = elementForm.main
    /** Блок в котором отображается выбор региона */
    const divRegion = doc.querySelector('.division-column__region')
    /**  */
    let objCountry
    let objRegions
    /** Переменная в которой храним заголовок статьи, если был указан заголовок, но не выбрана статья */
    let titleArticle

    /** Заглавная буква */
    function capitalize(s) {
      return s && s[0].toUpperCase() + s.slice(1)
    }

    // ------------------->
    // TyneMCE
    // ------------------->
    tinymce.init({
      /** Инициализируем редактор */
      selector: '#content',
      /** Устанавливаем язык редактора */
      language: 'ru',
      icons_url: '/public/js/icons/cloudFRT/icons.js',
      icons: 'cloudFRT', // use icon pack
      min_height: 400,
      // placeholder: 'Ну что начнём творить...',
      plugins:
        'lists advlist anchor link autolink image table preview wordcount searchreplace emoticons fullscreen visualblocks media visualchars quickbars template autoresize pagebreak',
      // Настройки bullist
      advlist_bullet_styles: 'square circle disc',
      allow_html_in_named_anchor: true,
      // autolink
      link_default_target: '_blank',
      link_context_toolbar: true,
      link_default_protocol: 'https',
      // Этот параметр позволяет указать, должен ли редактор анализировать и сохранять условные комментарии.
      allow_conditional_comments: true,
      // === === === === === === === === === === === ===
      //
      // === === === === === === === === === === === ===
      powerpaste_word_import: 'clean',
      powerpaste_html_import: 'clean',
      // === === === === === === === === === === === ===
      // AUTORESIZE
      // === === === === === === === === === === === ===
      autoresize_bottom_margin: 5,
      // === === === === === === === === === === === ===
      // PAGEBREAK
      // === === === === === === === === === === === ===
      // pagebreak_split_block: true,

      toolbar_sticky: true,
      // contextmenu: 'link image table',
      /**
       * bullist - маркированный список
       * numlist - нумерованный список
       * anchor - якорь
       *  quickimage
       */
      toolbar:
        'fullscreen preview print searchreplace undo redo cut copy paste | bold italic underline strikethrough forecolor backcolor link anchor image media alignleft aligncenter alignright alignjustify numlist bullist table | emoticons wordcount visualblocks visualchars template pagebreak | dropzone typograf format',
      quickbars_selection_toolbar:
        'bold italic | blocks | quicklink blockquote',
      paste_tab_spaces: 2, // Этот параметр определяет, сколько пробелов используется для представления символа табуляции в HTML при вставке обычного текстового содержимого. По умолчанию плагин Paste преобразует каждый символ табуляции в 4 последовательных символа пробела.
      paste_data_images: true,
      //* -------------------> IMAGES <--------------------------------
      file_picker_types: 'file image media',
      // image_caption: true, // figure ->caption
      /* enable title field in the Image dialog*/
      image_title: true, // title=""
      image_advtab: true, // Эта опция добавляет в диалоговое окно изображения вкладку «Дополнительно», позволяющую добавлять к изображениям собственные стили, интервалы и границы.
      a11ychecker_allow_decorative_images: true, //?
      file_picker_callback: function (callback, value, meta) {
        console.log('⚡ callback::', callback)
        console.log('⚡ value::', value)
        console.log('⚡ meta::', meta)
        var input = document.createElement('input')
        input.setAttribute('type', 'file')
        input.setAttribute('accept', 'image/*')

        /* Note: In modern browsers input[type="file"] is functional without even adding it to the DOM, but that might not be the case in some older or quirky browsers like IE, so you might want to add it to the DOM just in case, and visually hide it. And do not forget do remove it once you do not need it anymore. */

        input.onchange = function () {
          var file = this.files[0]
          var reader = new FileReader()

          reader.onload = function () {
            /* Note: Now we need to register the blob in TinyMCEs image blob registry. In the next release this part hopefully won't be necessary, as we are looking to handle it internally. */
            var id = 'blobid' + new Date().getTime()
            var blobCache = tinymce.activeEditor.editorUpload.blobCache
            var base64 = reader.result.split(',')[1]
            var blobInfo = blobCache.create(id, file, base64)
            blobCache.add(blobInfo)

            /* call the callback and populate the Title field with the file name */
            callback(blobInfo.blobUri(), { title: file.name })
          }
          reader.readAsDataURL(file)
        }

        input.click()
      },
      // -------------------> CSS <-------------------
      content_style:
        'figure { padding: 1rem; box-shadow: 0 2px 10px -1px rgba(69, 90, 100, 0.3);transition: box-shadow 0.2s ease-in-out; background-color: #fff;background-clip: border-box; border: 1px solid var(rgba(0, 0, 0, 0.125);}',

      setup: (editor) => {
        /** Пункты меню пересоздаются при закрытии и открытии меню, поэтому нам нужна переменная для хранения состояния переключаемого пункта меню */
        let toggleState = false
        //* ************************************
        //* ТИПОГРАФ
        //* ************************************
        editor.ui.registry.addButton('typograf', {
          icon: 'typograf',
          tooltip: 'Типографирование текста',
          onAction() {
            const tiny = tp.execute(editor.getContent())
            tinyMCE.activeEditor.setContent(tiny)
          },
        })

        editor.ui.registry.addButton('format', {
          icon: 'formating',
          tooltip: 'Приведение разметки текста к заданным параметрам',
          onAction() {
            bodyEditor =
              tinyMCE.activeEditor.iframeElement.contentWindow.document.getElementById(
                'tinymce',
              )
            htmlFormatting(bodyEditor, validElements)
          },
        })

        editor.ui.registry.addButton('dropzone', {
          icon: 'drag_drop',
          tooltip: 'Зона загрузки изображений',
          onAction() {
            dropZoneForm = dropZoneForm || doc.querySelector('.dropzone-file')
            dropZoneForm.classList.add(positionDropAbsolute)
            /** Кнопка закрыть dropzone */
            divCloseDropZone = divCloseDropZone || doc.createElement('div')
            divCloseDropZone.classList.add('dropzone-close')
            divCloseDropZone.id = 'dc'
            dropZoneForm.appendChild(divCloseDropZone)
            /** Устанавливаем класс для отображения */
            wrapper.classList.toggle('cover')
            divCloseDropZone.addEventListener('click', (e) => {
              dropZoneForm.classList.remove(positionDropAbsolute)
              wrapper.classList.toggle('cover')
            })
          },
        })
      },
    })

    // ──────────────────────────────── DROPZONE ─────────────────────────────────────

    Dropzone.autoDiscover = false
    const dropzone = new Dropzone('.dropzone', {
      dictDefaultMessage: lang.ru.dropzone,
      url: '/upload/article-country',
      method: 'post',
      timeout: 60000,
      // acceptedFiles: 'image/*',
      acceptedFiles: 'image/jpeg, image/png , image/jpg, image/svg',
      thumbnailWidth: 240,
      thumbnailHeight: 240,
      clickable: true,
    })

    dropzone.on('addedfile', (file) => {
      let val = titleInput.value
      if (val.length === 0) {
        // dropzone.off('error')
        dropzone.removeFile(file)
        dropzone.disable()
        titleInput.focus()
        _$.message('error', {
          title: '❗',
          message: 'Перед загрузкой заполните заголовок',
          position: position,
        })
      }
    })

    /**
     *  Вызывается непосредственно перед отправкой каждого файла. Получает объект xhr и объекты formData в качестве второго и третьего параметров, поэтому имеется возможность добавить дополнительные данные. Например, добавить токен CSRF
     */
    dropzone.on('sending', (file, xhr, formData) => {
      // BUG:🐞 Если добавляется несколько файлов то к каждому файлу добавляется значение
      // FIXME: Ко всем файлам один csrf-token
      formData.append('csrf', csrf)
      formData.append('count', count)
      let val = titleInput.value
      if (val.length > 0) {
        formData.append('name', translit(titleInput.value))
      }
    })

    /** Вызывается для каждого файла, который был отклонен, поскольку количество файлов превышает ограничение maxFiles. */
    dropzone.on('maxfilesexceeded', () => {
      //* NOTE: Удаляем файлы к загрузки превысившие лимит по количеству добавляемых к загрузке за один раз
      // upload.removeFile(file)
      maxfilesexceeded = true
      _$.message('error', {
        title: message.limit.title,
        message: message.limit.success,
        position: position,
      })
    })

    // === === === === === === === === === === === ===
    // Вызывается, когда загрузка была успешной или ошибочной.
    // === === === === === === === === === === === ===
    dropzone.on('complete', (file) => {
      if (file.status === 'error' && maxfilesexceeded === false) {
        _$.message('error', {
          title: message.error.title,
          message: message.error.success,
          position: position,
        })
        dropzone.removeFile(file)
      } else if (file.status === 'success') {
        _$.message('success', {
          title: message.success.title,
          message: message.success.done,
          position: position,
        })
      }
    })

    // === === === === === === === === === === === ===
    // Файл был успешно загружен. Получает ответ сервера в качестве второго аргумента.
    // === === === === === === === === === === === ===
    dropzone.on('success', (file, response) => {
      try {
        // Add default option box for each preview.
        var defaultRadioButton = Dropzone.createElement(
          `<div class="d-flex default-pic-container"><input type="radio" class="file-img-default" name="default_pic" value="${response.body.webpOriginal}" /> Основное фото</div>`,
        )
        file.previewElement.appendChild(defaultRadioButton)
        console.log('⚡ file.previewElement::', file.previewElement)
        // file.previewElement.firstChild(defaultRadioButton)
        // imgUpload.push(response.body)
        folder.value = translit(titleInput.value)
        /** Увеличиваем счётчик загруженных изображений на 1 */
        count++
        /** Уникальный id к каждому изображению вставленному в редактор. (Для удаления изображения из редактора) */
        const fileId = file.upload.uuid
        /**  */
        const create = Dropzone.createElement
        /** исходный размер фото */
        const width = file.width
        const height = file.height
        /** Object с уменьшенными копиями изображения */
        const resizeImgObj = response.body.resize
        /** контейнер в котором отображаются детали фото */
        const details = file.previewElement.querySelector('.dz-details')
        /** кнопка Удалить */
        const removeButton = create(
          '<div class="d-flex delete-img"><button type="button" class="remove btn btn-primary btn-sm">Удалить файл</button></div>',
        )
        /** Элемент в котором отображаются превью фото, кнопка удалить и детали фото */
        const preview = file.previewElement
        const size = create(
          `<div class="prev-img-wigth-height"><span>${width} x ${height} px.</span></div>`,
        )
        /** Описание фото исходя из заголовка статьи и количества загрузок */
        const alt = count + '-' + titleInput.value
        /** добавляем в детали размер изображения */
        details.appendChild(size)
        /** добавляем кнопку удалить фото */
        preview.appendChild(removeButton)
        /**  */
        imgUpload[fileId] = response.body

        totalInput.value = count
        total.innerHTML = count
        /** Устанавливаем обработчики события, для вставки изображения в редактор. По клику на изображение, или по его данным */
        _$.delegate(
          preview,
          '.dz-image',
          'click',
          clickImage.bind(
            null,
            resizeImgObj,
            response.body.webpOriginal,
            alt,
            fileId,
          ),
        )
        _$.delegate(
          preview,
          '.dz-details',
          'click',
          clickImage.bind(
            null,
            resizeImgObj,
            response.body.webpOriginal,
            alt,
            fileId,
          ),
        )
        _$.delegate(preview, '.file-img-default', 'change', function (e) {
          console.log('⚡ e::', e)
        })
        /** Удаление изображения */
        removeButton.addEventListener('click', (e) => {
          e.preventDefault()
          _$.ajax('/article/delete-image', {
            method: 'delete',
            body: {
              files: response.body.files,
              fields: {
                csrf: csrf,
              },
            },
          })
            .then((done) => {
              count--
              total.innerHTML = count
              totalInput.value = count
              deleteUploadFiles(done, file, fileId)
            })
            .catch((error) => error)
        })
      } catch (err) {
        console.log('⚡ err::', err)
      }
      // console.log('⚡ imgUpload::', imgUpload)
    })

    /** Вставляем изображение в редактор */
    function clickImage(resizeImgObj, webpOriginal, width, height) {
      const img = picture(resizeImgObj, webpOriginal, width, height)
      tinyMCE.activeEditor.execCommand('mceInsertContent', false, img)
    }

    /** Удаляем изображения. */
    function deleteUploadFiles(done, file, fileId) {
      console.log('⚡ fileId::', fileId)
      if (done.status === 201) {
        _$.message('success', {
          title: message.delete.title,
          message: message.delete.body,
          position: position,
        })

        dropzone.removeFile(file)

        let img =
          tinyMCE.activeEditor.iframeElement.contentWindow.document.getElementById(
            fileId,
          )
        img.parentNode.removeChild(img)
        delete imgUpload[fileId]
      }
    }
    /**  */
    function translit(val) {
      return cyrillicToTranslit.transform(val, '-').toLowerCase()
    }
    /**  */
    titleInput.addEventListener('change', async (e) => {
      try {
        console.log('⚡ e::', e)
        await urlTranslit(e.target.value)
        // let titleVal = e.target.value.replace(/([,\-.!])/g, '')
        // let country = countryField.value.replace(/([,\-.!])/g, '')
        // console.log('⚡ countryField.value::', countryField.value)
        // console.log('⚡ country::', country)
        // if (country === '') {
        //   console.log('TADA')
        //   titleArticle = e.target.value
        //   _$.message('error', {
        //     title: '🗺',
        //     message: lang.ru.error.country,
        //     position: position,
        //   })
        // } else {
        //   let trn = translit(country + '-' + titleVal)
        //   let total = titleVal.length
        //   urlInput.value = total > 0 ? 'country-' + trn + '.html' : titleVal
        //   dropzone.enable()
        //   if (total > 0) {
        //     let done = await validateUrl(urlInput.value)
        //     if (done.total > 0) {
        //       urlInput.value = done.url
        //     }
        //   }
        // }
        // return countryField.value !== '' ? await urlTranslit() : ''
      } catch (err) {
        console.log('⚡ err::change', err)
      }
    })

    titleInput.addEventListener('input', listenerTitleInput, false)
    function listenerTitleInput(e) {
      try {
        e.preventDefault()
        // console.log('⚡ event::', e)
        let country = countryField.value
        if (country === '') {
          e.target.value = ''
          _$.message('error', {
            title: '🗺',
            message: lang.ru.error.country,
            position: position,
          })
        }
      } catch (error) {
        console.log('⚡ error::', error)
      }
    }

    async function urlTranslit(input) {
      let titleVal = input.replace(/([,\-.!])/g, '')
      let country = countryField.value.replace(/([,\-.!])/g, '')

      if (country === '') {
        titleArticle = input.value
        _$.message('error', {
          title: '🗺',
          message: lang.ru.error.country,
          position: position,
        })
      } else {
        let trn = translit(country + '-' + titleVal)
        let total = titleVal.length
        urlInput.value = total > 0 ? 'country-' + trn + '.html' : titleVal
        dropzone.enable()
        if (total > 0) {
          let done = await validateUrl(urlInput.value)
          if (done.total > 0) {
            urlInput.value = done.url
          }
        }
      }
      console.log('⚡ titleArticle::', titleArticle)
    }
    function validateUrl(val) {
      return _$.ajax('/article/validate', {
        method: 'post',
        body: {
          type: capitalize(urlAdd),
          params: 'url',
          value: val,
          csrf: csrf,
        },
      })
    }

    /** Сохраняем статью  */
    submit.addEventListener('click', function (e) {
      /** Заголовок статьи */
      let title = titleInput.value
      /** Контент статьи */
      let content = tinyMCE.activeEditor.getContent()
      /** Статья участвует в поиске */
      let searchable = elementForm.searchable.checked
      /** Папка в которую загружаются изображения */
      let folderImage = folder.value
      /** Сколько всего загруженно изображений */
      let imageTotal = totalInput.value
      /** Тэги */
      let tags = elementForm.tags.value
      /** Локация */
      let location = elementForm.location.value.trim()
      /** Страна */
      let country = countryField.value.trim()
      /** id страны */
      let country_id = Number(objCountry[country])
      /** Регион */
      let region = regionField.value.trim()
      /** Город посёлок и т.д. */
      let city = cityField.value.trim()
      // console.log('⚡ country_id::', country_id)
      // console.log('⚡ typeof country_id::', typeof country_id)
      let obj = {}
      let i = 0
      /** Сколько всего вставлено изображений в материал */
      obj.imageTotalArticle = i
      obj.folder = folderImage
      obj.upload_total = imageTotal
      obj.img_upload = imgUpload
      if (title.length === 0) {
        _$.message('error', {
          title: '➡ ',
          message: save.error.title,
          position: position,
        })
      } else if (location === '') {
        _$.message('error', {
          title: '➡ ',
          message: save.error.location,
          position: position,
        })
      } else if (country_id === '') {
        _$.message('error', {
          title: '➡ ',
          message: save.error.country,
          position: position,
        })
      } else if (urlAdd === 'ate' && region === '') {
        _$.message('error', {
          title: '➡ ',
          message: save.error.region,
          position: position,
        })
      } else if (urlAdd === 'city' && city === '') {
        _$.message('error', {
          title: '➡ ',
          message: save.error.city,
          position: position,
        })
      } else {
        /** csrf */
        obj.csrf = csrf
        obj.title = title
        /** Ссылка статьи */
        obj.url = urlInput.value.trim()
        /** Если нет материала, то не участвует в поиске */
        obj.searchable = content && searchable ? true : false
        /** Локация */
        obj.location = location.replace(/([, ])/g, ' ')
        obj.content = content.trim()
        obj.country = country
        obj.country_id = country_id
        // console.log('⚡ objCountry[country]::', objCountry[country])
        if (urlAdd === 'ate') {
          obj.ate = region
        }
        if (urlAdd === 'city') {
          obj.city = cityField.value.trim()
        }

        obj.main = main.checked ? true : false
        if (folderImage !== '' && imageTotal !== '') {
          let img =
            tinyMCE.activeEditor.iframeElement.contentWindow.document.querySelectorAll(
              'img',
            )
          let arr = Array.prototype.slice.call(img)
          /** Массив изображений вставленных в материал */
          obj.image = arr.map((item, index) => {
            i++
            return item.src
          })
        }
        obj.image = obj.image || []
        /** Возможность оценить статью */
        obj.like = elementForm.like.checked
        /** Ключевые слова */
        obj.keyword = elementForm.keyword.value.trim()
        /** Описание материала */
        obj.description = elementForm.description.value.trim()
        /** Отображать количество просмотров */
        obj.numberViews = elementForm.numberViews.checked
        /** Возможность комментировать статью */
        obj.comments = elementForm.comments.checked
        /** Тэги по которым можно найти */
        obj.tags = tags // !== '' ? tags.split(',') : []
        obj.id = nanoid()
        // console.log('⚡ imgUpload-1::', imgUpload)
        _$.ajax('/article/create-' + urlAdd, {
          method: 'put',
          body: { ...obj },
        })
          .then((done) => {
            preloader.hide()

            if (done.insert === true) {
              formAdd._form.reset()
              _$.message('success', {
                title: save.success.title,
                message: save.success.message,
                position: position,
              })
            } else {
              console.log('⚡ done::', done)
              _$.message('error', {
                title: '🗺',
                message: done.message,
                position: position,
              })
            }
          })
          .catch((error) => error)
      }
    })

    /** Выбор страны */
    // ul
    const dropdown = doc.querySelector('.value-list')
    objCountry = inputFilter(countryField, dropdown, 'страну')
    if (urlAdd !== 'country') {
      console.log('⚡ urlAdd::', urlAdd)

      /**
       * Регион
       */
      let dropdownRegion = doc.querySelector('.region-list')
      // Данные с сервера в json
      // let objRegions
      function clear(elem, input) {
        elem.innerHTML = ''
        input.value = ''
      }
      function insertRegion(field, list, div, regionArr, language) {
        let len = regionArr.length
        let i = 0
        clear(list, field)
        for (i = 0; i < len; i++) {
          let li = doc.createElement('li')
          li.innerText = regionArr[i].title
          li.dataset.id = regionArr[i].id
          list.appendChild(li)
        }
        div.classList.add('open')
        objRegions = inputFilter(field, list, language)
      }

      /**
       *
       * @param {Number} id Страна по которому делаем выборку регионов страны из колонки country_id
       */
      function region(id, field, list, div, language, url = 'regions') {
        preloader.show()
        _$.ajax('/geo/' + url, {
          method: 'post',
          body: {
            csrf: csrf,
            id: id,
          },
        })
          .then((done) => {
            clear(list, field)
            preloader.hide()
            insertRegion(field, list, div, done.regions, language)
          })
          .catch((error) => error)
      }

      countryField.addEventListener('change', async (e) => {
        let target = e.target
        let countryName = e.target.value.trim()
        let id = objCountry[countryName]
        console.log('⚡ id::', id)
        console.log('⚡ regionField::', regionField)
        console.log('⚡ dropdownRegion::', dropdownRegion)
        console.log('⚡ divRegion::', divRegion)
        region(id, regionField, dropdownRegion, divRegion, 'край и т.д.')
        // await urlTranslit()
      })

      dropdown.addEventListener('click', async (e) => {
        let target = e.target
        let id = target.dataset.id
        region(id, regionField, dropdownRegion, divRegion, 'край и т.д.')
        // await urlTranslit()
      })

      if (urlAdd === 'city') {
        /** Регион */
        let cityField = doc.querySelector('.city-value')
        let dropdownCities = doc.querySelector('.city-list')
        let divCities = doc.querySelector('.division-column__city')
        let objCity

        regionField.addEventListener('change', (e) => {
          let target = e.target
          let regionName = e.target.value.trim()
          let id = objRegions[regionName]
          region(
            id,
            cityField,
            dropdownCities,
            divCities,
            'город, село и т.д.',
            'cities',
          )
        })

        dropdownRegion.addEventListener('click', (e) => {
          let target = e.target
          let id = target.dataset.id
          region(
            id,
            cityField,
            dropdownCities,
            divCities,
            'город, село и т.д.',
            'cities',
          )
        })
      }
    }
  })
})()
