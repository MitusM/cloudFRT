import htmlFormatting from '../../../../../assets/js/html-formatting/html-formatting.js'
// console.log('⚡ htmlFormatting::1', htmlFormatting)
const headerRule = {
  br: {
    process(node) {
      const parent = node.parentNode,
        space = document.createTextNode(' ')

      parent.replaceChild(space, node)
    },
  },
}
/**  */
const validElements = {
  img: {
    valid_styles: '',
    valid_classes: 'foto',
    no_empty: false,
    valid_elements: 'src,width,height',
    // process: function (node) {
    // }
  },
  h1: {
    convert_to: 'h2',
    valid_styles: 'text-align',
    valid_classes: 'heading',
    no_empty: true,
    valid_elements: headerRule,
  },
  'h2,h3,h4': {
    valid_styles: 'text-align',
    valid_classes: 'heading',
    no_empty: true,
    valid_elements: headerRule,
  },
  p: {
    valid_styles: 'text-align',
    valid_classes: '',
    no_empty: true,
  },
  a: {
    valid_styles: '',
    valid_classes: '',
    no_empty: true,

    process(node) {
      const host = `https://${window.location.host}/`
      if (node.href.indexOf(host) !== 0) {
        node.target = '_blank'
      }
    },
  },
  br: {
    valid_styles: '',
    valid_classes: '',
  },
  'blockquote,b,strong,i,em,s,strike,sub,sup,kbd,ul,ol,li,dl,dt,dd,time,address,thead,tbody,tfoot':
    {
      valid_styles: '',
      valid_classes: '',
      no_empty: true,
    },
  'table,tr,th,td': {
    valid_styles: 'text-align,vertical-align',
    valid_classes: '',
    no_empty: true,
  },
  'embed,iframe': {
    valid_classes: '',
  },
}

/** Форматирование html разметки, по заданным правилам */
// const formatting = function () {
//   const body =
//     tinyMCE.activeEditor.iframeElement.contentWindow.document.getElementById(
//       'tinymce',
//     )
// }

export { htmlFormatting, validElements }
