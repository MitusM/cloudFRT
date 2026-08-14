// import { Dropzone } from 'dropzone'
// console.log('⚡ Dropzone::', Dropzone)
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
  },
}

let maxfilesexceeded = false

// Disabling autoDiscover, otherwise Dropzone will try to attach twice.
Dropzone.autoDiscover = false
//TODO: Настройки drag and drop перенести на страницу настроек так чтобы они были доступны в браузере
const upload = new Dropzone('div#dropzone', {
  url: '/upload/article',
  dictDefaultMessage: lang.ru.dropzone,
  acceptedFiles: 'image/*',
  // maxFiles: 3, //* лимит на загрузку файлов. Сколько всего можно загрузить файлов
  uploadMultiple: false,
  parallelUploads: 1,
  addRemoveLinks: true,
  withCredentials: true,
  timeout: 600000,
  thumbnailWidth: 240,
  thumbnailHeight: 240,
  // previewTemplate: document.querySelector("#tpl").innerHTML
})

// module.exports = Dropzone
export default upload
