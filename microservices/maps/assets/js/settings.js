;(async () => {
  let doc = document
  // Settings
  doc.addEventListener('DOMContentLoaded', async () => {
    /** Add settings form for id  */
    let formAdd = new _$.Form('form__add')
    // console.log('⚡ formAdd::', formAdd._form)
    let elementForm = formAdd._form.elements
    // console.log('⚡ elementForm::', elementForm)
    /** Элементы формы добавления или редактирования пользователя */
    let submit = elementForm[3]

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

    submit.addEventListener('click', (e) => {
      e.preventDefault()
      let limit = elementForm[0].value
      let quota = elementForm[1].value
      let cache = elementForm[2].checked
      axios
        .put('/users/settings', {
          limit: limit,
          quota: quota,
          cache: cache,
          csrf: csrf,
        })
        .then((res) => {
          let data = res.data
          let mess = ''
          /** Успешное выполнение операций. Если пришёл ответ со статусом 201. Все остальные ошибка */
          if (data.status === 201) {
            if (data.message.bd === 1) {
              mess += 'Данные успешно добавлены в Базу Данных! </br>'
            }
            if (data.message.redis === 1) {
              mess += 'Настройки успешно сохранены в Redis! </br>'
            }
            if (data.message.cache === 1) {
              mess += 'Кэш успешно обновлён!'
            }
            message('success', mess)
          } else {
          }
        })
        .catch((err) => {
          console.log('⚡ err::', err)
        })
    })
  })
})()
