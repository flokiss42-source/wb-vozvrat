import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchFinancialReport, fetchStocks } from '../src/wb-api.js';

const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => null }, json: async () => body });

test('загружает финансовый отчёт постранично без сохранения токена', async () => {
  const calls = [];
  const pages = [[{ rrd_id: 1 }, { rrd_id: 2 }], [{ rrd_id: 3 }]];
  const rows = await fetchFinancialReport({ token: 'secret', dateFrom: '2026-08-01', dateTo: '2026-08-02', pageLimit: 2,
    fetchImpl: async (url, options) => { calls.push({ url: String(url), options }); return response(pages.shift()); } });
  assert.equal(rows.length, 3); assert.equal(rows[2].__row, 3);
  assert.match(calls[1].url, /rrdid=2/);
  assert.equal(calls[0].options.headers.Authorization, 'secret');
  assert.doesNotMatch(calls[0].url, /secret/);
});

test('останавливается на пустой странице и сообщает ошибки API', async () => {
  assert.deepEqual(await fetchFinancialReport({ token: 'x', dateFrom: '2026-08-01', dateTo: '2026-08-01', fetchImpl: async () => response([]) }), []);
  await assert.rejects(fetchFinancialReport({ token: 'x', dateFrom: '2026-08-01', dateTo: '2026-08-01', fetchImpl: async () => response({}, 401) }), /HTTP 401/);
});

test('проверяет токен и даты до сетевого запроса', async () => {
  await assert.rejects(fetchFinancialReport({ token: '', dateFrom: '2026-08-01', dateTo: '2026-08-02' }), /WB_API_TOKEN/);
  await assert.rejects(fetchFinancialReport({ token: 'x', dateFrom: '2026-99-01', dateTo: '2026-08-02' }), /Некорректная дату|Некорректная дата/);
  await assert.rejects(fetchFinancialReport({ token: 'x', dateFrom: '2026-08-03', dateTo: '2026-08-02' }), /позже/);
});

test('читает вложенный формат актуального API остатков', async () => {
  const rows = await fetchStocks({ token: 'x', fetchImpl: async (url, options) => {
    assert.match(String(url), /stocks-report\/wb-warehouses/); assert.equal(options.method, 'POST');
    return response({ data: { items: [{ nmId: 1, quantity: 2 }] } });
  }});
  assert.deepEqual(rows, [{ nmId: 1, quantity: 2 }]);
  await assert.rejects(fetchStocks({ token: 'x', fetchImpl: async () => response({ data: {} }) }), /неожиданный формат/);
});
