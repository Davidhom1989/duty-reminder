/*
 * 值班提醒 · Service Worker
 *
 * 唯一职责：在站点内提供一个虚拟日历地址 calendar.ics。
 * 页面把动态生成的日历内容写入缓存后跳转到该地址，Safari / Chrome 收到
 * Content-Type: text/calendar 的响应，会直接弹出「添加到日历」。
 *
 * 刻意不缓存任何页面资源：HTML / 资源请求一律放行走网络，确保每次打开都是最新版本。
 */
'use strict';

const CAL_NAME = 'calendar.ics';
const CACHE_NAME = 'duty-calendar-v1';
const CAL_URL = new URL(CAL_NAME, self.registration.scope).href;

const CAL_HEADERS = {
  'Content-Type': 'text/calendar; charset=utf-8',
  'Content-Disposition': 'inline; filename="duty-reminder.ics"',
  'Cache-Control': 'no-store, must-revalidate'
};

const EMPTY_CALENDAR =
  'BEGIN:VCALENDAR\r\n' +
  'VERSION:2.0\r\n' +
  'PRODID:-//DutyReminder//CN\r\n' +
  'CALSCALE:GREGORIAN\r\n' +
  'END:VCALENDAR\r\n';

/* 新版本立即接管，避免首次使用要刷新一次才生效 */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await self.clients.claim();
  })());
});

/* 页面 → SW：写入本次生成的日历内容，写完回执，页面收到回执后再跳转 */
self.addEventListener('message', event => {
  const data = event.data || {};
  if (data.type !== 'SET_CALENDAR') return;

  const port = event.ports && event.ports[0];
  const reply = payload => { try { if (port) port.postMessage(payload); } catch (e) {} };

  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(CAL_URL, new Response(String(data.body || EMPTY_CALENDAR), {
        status: 200,
        headers: { 'Content-Type': 'text/calendar; charset=utf-8' }
      }));
      reply({ ok: true });
    } catch (err) {
      reply({ ok: false, error: String(err) });
    }
  })());
});

/* 拦截虚拟日历地址；其余请求一律不拦截，直接走网络 */
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (!url.pathname.endsWith('/' + CAL_NAME)) return;

  event.respondWith((async () => {
    let body = EMPTY_CALENDAR;
    try {
      const cache = await caches.open(CACHE_NAME);
      const hit = await cache.match(CAL_URL);
      if (hit) body = await hit.text();
    } catch (err) { /* 取不到就返回空日历，不影响页面 */ }
    return new Response(body, { status: 200, headers: CAL_HEADERS });
  })());
});
