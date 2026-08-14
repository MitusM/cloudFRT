// import path from 'path'
// import pkg from 'app-root-path'
// const appRoot = pkg.path
// const dir = (dir) => {
//     dir = dir ? ['/view/html/', dir] : ['/view/', 'html']
//     return path.join(appRoot, ...dir)
// }

async function html(obj, res) {
    return await res.app.ask('render', {
        server: {
            action: 'html',
            meta: {
                dir: obj.dir,
                page: obj.page,
                data: {
                    ...obj.data
                }
            }
        }
    })
}

export {
    dir,
    html
}