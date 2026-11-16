/**
 * Luv Sync (прототип) — мини-приложение «обновить цвета полосок».
 * Его запускает циферблат Luv Face при включении экрана (с параметром 'auto'): приложение записывает цвета в общую
 * память часов и сразу возвращает на циферблат. Открытое вручную (из списка приложений) — ничего не закрывает и
 * показывает результат, чтобы можно было проверить.
 *
 * ПРОТОТИП: цвета пока придуманные (shared/testdata.js), с каждой записью они другие. Настоящие цвета от телефона — следующий шаг.
 */
import { createWidget, widget, align } from '@zos/ui'
import * as router from '@zos/router'
import * as zfs from '@zos/fs'
import { KEY_COLORS, KEY_TS, KEY_N, SEG_TOTAL, pack, toInt } from '../shared/link'
import { testColors } from '../shared/testdata'

const W = 432
const H = 514
const OK_BACK_MS = 1200       // при автозапуске: сколько показывать результат перед возвратом на циферблат
const ERR_BACK_MS = 10000     // при ошибке дольше — чтобы успеть прочитать

let auto = false

/** Системная память: сначала глобальный hmFS (как у циферблата), если его нет — модуль @zos/fs. */
function sysApi() {
  try {
    if (typeof hmFS !== 'undefined' && hmFS && typeof hmFS.SysProSetChars === 'function') {
      return { name: 'hmFS', set: (k, v) => hmFS.SysProSetChars(k, v), get: (k) => hmFS.SysProGetChars(k) }
    }
  } catch (e) { /* пробуем дальше */ }
  try {
    if (zfs && typeof zfs.SysProSetChars === 'function') {
      return { name: '@zos/fs', set: (k, v) => zfs.SysProSetChars(k, v), get: (k) => zfs.SysProGetChars(k) }
    }
  } catch (e) { /* нет */ }
  return null
}

/** Записать цвета. Возвращает { ok, n, colors, via } или { ok:false, msg }. */
function doSync() {
  const s = sysApi()
  if (!s) return { ok: false, msg: 'нет SysPro (hmFS и @zos/fs)' }
  try {
    const n = toInt(s.get(KEY_N)) + 1
    const colors = testColors(n)
    const packed = pack(colors)
    s.set(KEY_COLORS, packed)
    s.set(KEY_TS, String(Date.now()))
    s.set(KEY_N, String(n))
    if (s.get(KEY_COLORS) !== packed) return { ok: false, msg: 'записал, но не читается обратно' }
    return { ok: true, n, colors, via: s.name }
  } catch (e) {
    return { ok: false, msg: 'ошибка записи: ' + e }
  }
}

/** Вернуться на циферблат (пробуем несколько способов по очереди). */
function goHome() {
  try {
    if (typeof hmApp !== 'undefined' && hmApp && typeof hmApp.gotoHome === 'function') { hmApp.gotoHome(); return }
  } catch (e) { /* дальше */ }
  try {
    if (router && typeof router.home === 'function') { router.home(); return }
  } catch (e) { /* дальше */ }
  try {
    if (router && typeof router.exit === 'function') { router.exit(); return }
  } catch (e) { /* дальше */ }
  try { router.back() } catch (e) { /* остаёмся на экране приложения */ }
}

Page({
  onInit(param) {
    auto = (param === 'auto')
  },
  build() {
    createWidget(widget.FILL_RECT, { x: 0, y: 0, w: W, h: H, color: 0x000000 })
    const res = doSync()

    // шесть квадратов-образцов: те самые цвета, что записаны
    if (res.ok) {
      const size = 56
      const gap = 12
      const x0 = Math.round((W - (3 * size + 2 * gap)) / 2)
      for (let i = 0; i < SEG_TOTAL; i++) {
        const row = Math.floor(i / 3)
        const col = i % 3
        createWidget(widget.FILL_RECT, {
          x: x0 + col * (size + gap), y: 120 + row * (size + gap), w: size, h: size, color: res.colors[i]
        })
      }
    }

    const text = res.ok
      ? 'Готово. Запись № ' + res.n + '\n(' + res.via + ')' + (auto ? '' : '\nОткрыто вручную — никуда не возвращаю')
      : 'ОШИБКА:\n' + res.msg
    createWidget(widget.TEXT, {
      x: 20, y: 290, w: W - 40, h: 160, color: res.ok ? 0x43a857 : 0xff4517, text_size: 26,
      align_h: align.CENTER_H, align_v: align.CENTER_V, text_style: 1, text: text
    })

    if (auto) setTimeout(goHome, res.ok ? OK_BACK_MS : ERR_BACK_MS)
  },
  onDestroy() {}
})
