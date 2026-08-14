/* eslint-disable no-prototype-builtins */

const hash = (obj, int) => obj.hasOwnProperty(int)

/**
 * Создаём элемент picture
 * @param {Object} obj
 * @param {Object} obj.name имя файла
 * @param {Object} obj.size объём изображения
 * @param {Object} obj.width ширина изображения
 * @param {*} width ширина исходного изображения
 */
export const picture = (obj, webpOriginal, alt, fileId) => {
  'use strict'
  alt.replace(/([,\-.!])/g, '')
  let pictureElem = `<figure id="${fileId}" class="figure-picture-img"><picture>`

  let hash480 = hash(obj, 480)
  let hash960 = hash(obj, 960)
  let hash1280 = hash(obj, 1280)
  let hash1920 = hash(obj, 1920)
  let hash2700 = hash(obj, 2700)
  let img480
  let img960
  let img1280
  let img1920

  if (hash1280) {
    img1280 =
      hash1280 && hash2700
        ? `${obj[1280].pathFile} 1920w, ${obj[2700].pathFile} 2700w`
        : `${obj[1280].pathFile}`

    pictureElem += ` <source
    type="image/webp"
    media="(min-width: 1024px) and (max-width: 1920px)"
    srcset="${img1280}"/>`
  }

  //* > 480 (phone landscape & smaller)
  if (hash480) {
    img480 =
      hash480 && hash960
        ? `${obj[480].pathFile} 480w, ${obj[960].pathFile} 960w`
        : `${obj[480].pathFile} 480w`
    //
    pictureElem += ` <source
    type="image/webp"
    media="(max-width: 480px)"
    srcset="${img480}"/>`
  }

  if (hash960) {
    img960 =
      hash960 && hash1920
        ? `${obj[960].pathFile} 960w, ${obj[1920].pathFile} 1920w`
        : `${obj[960].pathFile} 960w`

    pictureElem += ` <source
    type="image/webp"
    media="(min-width: 480px) and (max-width: 1023px)"
    srcset="${img960}"/>`
  }

  if (hash1920) {
    img1920 =
      hash1920 && hash2700
        ? `${obj[1920]} 1920w, ${obj[2700]} 2700w`
        : `${obj[1920]}`

    pictureElem += ` <source
    type="image/webp"
    media="min-width: 1921px"
    srcset="${img1920}"/>`
  }

  pictureElem += `<img type="image/webp" src="${webpOriginal.pathFile}" alt="${alt}"">`
  //  srcset="${webpOriginal.pathFile} 2x
  pictureElem += ` <figcaption>${alt}</figcaption>`
  pictureElem += '</figure></picture>'

  return pictureElem
}
