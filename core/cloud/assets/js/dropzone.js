'use strict'
// dropzone — глобальный window.Dropzone с CDN (index.html каждого микросервиса)
window.Dropzone && (window.Dropzone.autoDiscover = false)

export function Upload(options) {
    // console.log('💯 options', options)
    const lang = options.lang
    const message = lang.ru.message
    const position = 'topCenter' || options.position

    let maxfilesexceeded = false
    const upload = new Dropzone('div#dropzone', {
        url: options.url,
        dictDefaultMessage: lang.ru.dropzone,
        acceptedFiles: options.acceptedFiles,
        // maxFiles: 3, //* лимит на загрузку файлов. Сколько всего можно загрузить файлов
        uploadMultiple: options.uploadMultiple || false,
        parallelUploads: options.parallelUploads || 1,
        addRemoveLinks: options.addRemoveLinks || true,
        withCredentials: options.withCredentials || true,
        timeout: options.timeout || 600000,
        thumbnailWidth: options.thumbnailWidth || 240,
        thumbnailHeight: options.thumbnailHeight || 240,
        // previewTemplate: document.querySelector("#tpl").innerHTML
    })
    upload.on('sending', (file, xhr, formData) => {
        const csrf = document.querySelector('meta[name=csrf-token]').getAttributeNode('content').value
        // BUG:🐞 Если добавляется несколько файлов то к каждому файлу добавляется значение
        // FIXME: Ко всем файлам один csrf-token
        //TODO: Ко всем файлам один csrf-token
        formData.append('csrf', csrf)
    })
    /** Вызывается для каждого файла, который был отклонен, поскольку количество файлов превышает ограничение maxFiles. */
    upload.on('maxfilesexceeded', () => {
        //* NOTE: Удаляем файлы к загрузки превысившие лимит по количеству добавляемых к загрузке за один раз
        // upload.removeFile(file)
        maxfilesexceeded = true
        _$.message('error', {
            title: message.limit.title,
            message: message.limit.success,
            position: position
        })
        // console.log('maxfilesexceeded===>')
    })

    // === === === === === === === === === === === ===
    //* Вызывается, когда загрузка была успешной или ошибочной. */
    // === === === === === === === === === === === ===
    upload.on('complete', (file) => {
        // FIX: DROPZONE - добавить всплывающее сообщение об неудачной или удачной загрузки файла
        if (file.status === 'error' && maxfilesexceeded === false) {
            _$.message('error', {
                title: message.error.title,
                message: message.error.success,
                position: position
            })
            upload.removeFile(file)
        } else if (file.status === 'success') {
            _$.message('success', {
                title: message.success.title,
                message: message.success.done,
                position: position
            })
        }
    })

    return upload
}