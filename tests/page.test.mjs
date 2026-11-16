// Прогон страницы синхронизатора в Node с заглушками API часов.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-'))
for (const d of ['page', 'shared']) fs.cpSync(path.join(root, d), path.join(tmp, d), { recursive: true })
fs.writeFileSync(path.join(tmp, 'package.json'), '{"type":"module"}')
// сборщик часов понимает импорт без расширения, Node — нет: в копиях дописываем .js
for (const f of ['page/index.js', 'shared/testdata.js']) {
  const p = path.join(tmp, f)
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/from '(\.\.?\/(?:shared\/)?\w+)'/g, "from '$1.js'"))
}
const mod = (name, code) => {
  const d = path.join(tmp, 'node_modules', ...name.split('/'))
  fs.mkdirSync(d, { recursive: true })
  fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name, type: 'module', main: 'index.js' }))
  fs.writeFileSync(path.join(d, 'index.js'), code)
}
mod('@zos/ui', `
export const widget = { FILL_RECT: 'FILL_RECT', TEXT: 'TEXT' }
export const align = { CENTER_H: 1, CENTER_V: 2 }
export function createWidget(type, p) { const w = { type, p }; globalThis.__widgets.push(w); return w }
`)
mod('@zos/router', `export function back() { globalThis.__nav.push('back') }`)
// @zos/fs без SysPro: проверяем и запасной путь, и основной (hmFS)
mod('@zos/fs', `export const nothing = 1`)

const mem = new Map()
const timers = []
globalThis.__widgets = []
globalThis.__nav = []
globalThis.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length }
let page = null
globalThis.Page = (o) => { page = o }
await import(pathToFileURL(path.join(tmp, 'page', 'index.js')).href)
assert.ok(page && typeof page.build === 'function' && typeof page.onInit === 'function')

const reset = () => { globalThis.__widgets = []; globalThis.__nav = []; timers.length = 0 }
const texts = () => globalThis.__widgets.filter((w) => w.type === 'TEXT').map((w) => w.p.text).join('|')

// 1) нет ни hmFS, ни SysPro в @zos/fs -> понятная ошибка, при автозапуске возврат через 10 с
reset()
page.onInit('auto'); page.build()
assert.match(texts(), /ОШИБКА/)
assert.match(texts(), /нет SysPro/)
assert.equal(timers.length, 1)
assert.equal(timers[0].ms, 10000)

// 2) есть hmFS: цвета записываются, счётчик растёт, образцы нарисованы
globalThis.hmFS = {
  SysProSetChars(k, v) { mem.set(k, v); return 0 },
  SysProGetChars(k) { return mem.has(k) ? mem.get(k) : '' }
}
let homed = 0
globalThis.hmApp = { gotoHome() { homed++ } }
reset()
page.onInit('auto'); page.build()
assert.equal(mem.get('luv_n'), '1')
const c1 = mem.get('luv_c')
assert.match(c1, /^([0-9a-f]{6},){5}[0-9a-f]{6}$/)
assert.ok(Number(mem.get('luv_ts')) > 0)
assert.match(texts(), /Запись № 1/)
// 6 образцов + фон
assert.equal(globalThis.__widgets.filter((w) => w.type === 'FILL_RECT').length, 1 + 6)
// автозапуск: возврат на циферблат через 1.2 с через hmApp.gotoHome
assert.equal(timers.length, 1)
assert.equal(timers[0].ms, 1200)
timers[0].fn()
assert.equal(homed, 1)

// 3) повторный запуск — запись № 2 и другие цвета
reset()
page.onInit('auto'); page.build()
assert.equal(mem.get('luv_n'), '2')
assert.notEqual(mem.get('luv_c'), c1)

// 4) открыто вручную (без 'auto'): ничего не закрывает
reset()
page.onInit(undefined); page.build()
assert.equal(timers.length, 0)
assert.match(texts(), /вручную/)

// 5) если hmApp нет — запасные пути возврата не падают (router.home/exit нет -> back)
delete globalThis.hmApp
reset()
page.onInit('auto'); page.build()
timers[0].fn()
assert.deepEqual(globalThis.__nav, ['back'])

// 6) запись не читается обратно -> ошибка
globalThis.hmFS = { SysProSetChars() { return 0 }, SysProGetChars() { return '' } }
reset()
page.onInit('auto'); page.build()
assert.match(texts(), /не читается/)
console.log('page: ok')
