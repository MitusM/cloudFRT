import Typograf from 'typograf'
/**
 * Типограф
 * NOTE: 1 +- 2 1 <= 2 1 -> 2 (c), (tm) 10 C, 20 F 1/2, 3/4 10x3~=30
 * @param {*} text
 */
// let typograf = (text) => {
const tp = new Typograf({
  locale: ['ru', 'en-US'],
})
/** -> → →, <- → ← */
tp.enableRule('common/symbols/arrow')
// 	Добавление ° к C и F
tp.enableRule('common/symbols/cf')
// (c) → ©, (tm) → ™, (r) → ®
tp.enableRule('common/symbols/copy')
// №№ → №
tp.enableRule('ru/symbols/NN')
// Удаление повторяющихся пробелов между символами
tp.enableRule('common/space/delRepeatSpace')
// Пробел после знаков пунктуации
tp.enableRule('common/space/afterPunctuation')
// Пробел перед открывающей скобкой
tp.enableRule('common/space/beforeBracket')
// Удаление лишних пробелов после открывающей и перед закрывающей скобкой
tp.enableRule('common/space/bracket')
// Удаление пробела перед %, ‰ и ‱
tp.enableRule('common/space/delBeforePercent')
// Замена латинских букв на русские. Опечатки, возникающие при переключении клавиатурной раскладки
tp.enableRule('ru/typo/switchingKeyboardLayout')
/** != → ≠, <= → ≤, >= → ≥, ~= → ≅, +- → ± */
tp.enableRule('common/number/mathSigns')

// -tp. enableRule('*')
tp.enableRule('ru/money/*')
tp.enableRule('ru/date/*')
tp.enableRule('ru/optalign/*')
// tp.enableRule('ru/punctuation/*')
tp.enableRule('ru/dash/*')
tp.enableRule('common/space/*')
tp.enableRule('common/number/*')
// tp.enableRule('common/html/escape')
//- Разобраться с правилами что-бы в тексте пробелы не заменялись на &nbsp
tp.disableRule('common/nbsp/*')
//BUG: !!! Не удоляет теги из текста
// tp.disableRule('common/html/stripTags')
//-tp.disableRule('common/html/*')

// Неразрывный пробел перед последним словом в предложении, не более 5 символов
// tp.setSetting('common/nbsp/beforeShortLastWord', 'lengthLastWord', 5);

// Вложенные кавычки тоже «ёлочки» для русской типографики
tp.setSetting('common/punctuation/quote', 'ru', {
  left: '«',
  right: '»',
  removeDuplicateQuotes: true,
})

export default tp
