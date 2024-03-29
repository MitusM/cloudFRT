/**
 *
 * @param {object} inputField
 * @param {object} dropdown
 */
function inputFilter(inputField, dropdown, language) {
  const dropdownArray = [...dropdown.querySelectorAll('li')]
  // console.log(typeof dropdownArray)
  dropdown.classList.add('open')
  inputField.focus() // Demo purposes only
  let valueArray = []
  let obj = {}
  dropdownArray.forEach((item) => {
    valueArray.push(item.textContent)
    obj[item.textContent] = item.dataset.id
  })

  const closeDropdown = () => {
    dropdown.classList.remove('open')
  }

  inputField.addEventListener('input', () => {
    dropdown.classList.add('open')
    let inputValue = inputField.value.toLowerCase()
    // let valueSubstring
    if (inputValue.length > 0) {
      for (let j = 0; j < valueArray.length; j++) {
        if (
          !(
            inputValue.substring(0, inputValue.length) ===
            valueArray[j].substring(0, inputValue.length).toLowerCase()
          )
        ) {
          dropdownArray[j].classList.add('closed')
        } else {
          dropdownArray[j].classList.remove('closed')
        }
      }
    } else {
      for (let i = 0; i < dropdownArray.length; i++) {
        dropdownArray[i].classList.remove('closed')
      }
    }
  })

  dropdownArray.forEach((item) => {
    item.addEventListener('click', (evt) => {
      inputField.value = item.textContent
      dropdownArray.forEach((dropdown) => {
        dropdown.classList.add('closed')
      })
    })
  })

  inputField.addEventListener('focus', () => {
    inputField.placeholder = 'Первая буква...'
    dropdown.classList.add('open')
    dropdownArray.forEach((dropdown) => {
      dropdown.classList.remove('closed')
    })
  })

  inputField.addEventListener('blur', () => {
    inputField.placeholder = 'Выберите ' + language
    dropdown.classList.remove('open')
  })

  document.addEventListener('click', (evt) => {
    const isDropdown = dropdown.contains(evt.target)
    const isInput = inputField.contains(evt.target)
    if (!isDropdown && !isInput) {
      dropdown.classList.remove('open')
    }
  })

  return obj
}
export default inputFilter
