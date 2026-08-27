const ENDPOINT = 'https://statistics-api.wildberries.ru/api/v5/supplier/reportDetailByPeriod';

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`Некорректная дата: ${value}`);
  }
  return value;
}

export async function fetchFinancialReport({ token, dateFrom, dateTo, fetchImpl = fetch, pageLimit = 100000, maxPages = 100 }) {
  if (!token) throw new Error('Не задана переменная WB_API_TOKEN');
  validDate(dateFrom); validDate(dateTo);
  if (dateFrom > dateTo) throw new Error('dateFrom не может быть позже dateTo');
  const all = [];
  let rrdid = 0;
  for (let page = 0; page < maxPages; page++) {
    const url = new URL(ENDPOINT);
    url.searchParams.set('dateFrom', dateFrom);
    url.searchParams.set('dateTo', dateTo);
    url.searchParams.set('limit', String(pageLimit));
    url.searchParams.set('rrdid', String(rrdid));
    const response = await fetchImpl(url, { headers: { Authorization: token, Accept: 'application/json' } });
    if (!response.ok) {
      const retry = response.headers?.get?.('retry-after');
      throw new Error(`WB API вернул HTTP ${response.status}${retry ? `; повторить через ${retry} сек.` : ''}`);
    }
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error('WB API вернул неожиданный формат');
    if (!rows.length) return all.map((row, index) => ({ ...row, __row: index + 1 }));
    all.push(...rows);
    const next = Number(rows.at(-1)?.rrd_id);
    if (!Number.isFinite(next) || next <= rrdid) throw new Error('WB API вернул некорректный указатель пагинации');
    rrdid = next;
    if (rows.length < pageLimit) return all.map((row, index) => ({ ...row, __row: index + 1 }));
  }
  throw new Error(`Превышен безопасный лимит страниц (${maxPages})`);
}

async function getArray({ token, endpoint, dateFrom, fetchImpl = fetch }) {
  if (!token) throw new Error('Не задана переменная WB_API_TOKEN');
  const url = new URL(`https://statistics-api.wildberries.ru${endpoint}`);
  url.searchParams.set('dateFrom', dateFrom);
  const response = await fetchImpl(url, { headers: { Authorization: token, Accept: 'application/json' } });
  if (!response.ok) throw new Error(`WB API ${endpoint} вернул HTTP ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error(`WB API ${endpoint} вернул неожиданный формат`);
  return data;
}

export async function fetchStocks({ token, fetchImpl = fetch }) {
  if (!token) throw new Error('Не задана переменная WB_API_TOKEN');
  const response = await fetchImpl('https://seller-analytics-api.wildberries.ru/api/analytics/v1/stocks-report/wb-warehouses', {
    method: 'POST', headers: { Authorization: token, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: '{}', signal: AbortSignal.timeout(60000)
  });
  if (!response.ok) throw new Error(`WB API текущих остатков вернул HTTP ${response.status}`);
  const payload = await response.json();
  const rows = payload?.data?.items;
  if (!Array.isArray(rows)) throw new Error('WB API текущих остатков вернул неожиданный формат');
  return rows;
}
export const fetchIncomes = options => getArray({ ...options, endpoint: '/api/v1/supplier/incomes' });
export const fetchSales = options => getArray({ ...options, endpoint: '/api/v1/supplier/sales' });

export async function fetchGoodsReturns({ token, dateFrom, dateTo, fetchImpl = fetch }) {
  if (!token) throw new Error('Не задана переменная WB_API_TOKEN');
  validDate(dateFrom); validDate(dateTo);
  const url = new URL('https://seller-analytics-api.wildberries.ru/api/v1/analytics/goods-return');
  url.searchParams.set('dateFrom', dateFrom); url.searchParams.set('dateTo', dateTo);
  const response = await fetchImpl(url, { headers: { Authorization: token, Accept: 'application/json' } });
  if (!response.ok) throw new Error(`WB API возвратов вернул HTTP ${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload?.report)) throw new Error('WB API возвратов вернул неожиданный формат');
  return payload.report;
}

export async function fetchSupplies({ token, dateFrom, dateTo, fetchImpl = fetch }) {
  if (!token) throw new Error('Не задана переменная WB_API_TOKEN');
  const result = [], limit = 1000;
  for (let offset = 0; offset < 100000; offset += limit) {
    const url = new URL('https://supplies-api.wildberries.ru/api/v1/supplies');
    url.searchParams.set('limit', String(limit)); url.searchParams.set('offset', String(offset));
    const response = await fetchImpl(url, { method: 'POST', headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ dates: [{ from: dateFrom, till: dateTo, type: 'factDate' }], statusIDs: [5, 6] }) });
    if (!response.ok) throw new Error(`WB API поставок вернул HTTP ${response.status}`);
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error('WB API поставок вернул неожиданный формат');
    result.push(...rows);
    if (rows.length < limit) return result;
  }
  throw new Error('Превышен безопасный лимит поставок');
}

export async function fetchSupplyGoods({ token, supplyId, fetchImpl = fetch }) {
  const result = [], limit = 1000;
  for (let offset = 0; offset < 100000; offset += limit) {
    const url = new URL(`https://supplies-api.wildberries.ru/api/v1/supplies/${encodeURIComponent(supplyId)}/goods`);
    url.searchParams.set('limit', String(limit)); url.searchParams.set('offset', String(offset));
    const response = await fetchImpl(url, { headers: { Authorization: token, Accept: 'application/json' } });
    if (!response.ok) throw new Error(`WB API товаров поставки ${supplyId} вернул HTTP ${response.status}`);
    const rows = await response.json(); if (!Array.isArray(rows)) throw new Error('WB API товаров поставки вернул неожиданный формат');
    result.push(...rows); if (rows.length < limit) return result;
  }
  throw new Error('Превышен безопасный лимит товаров поставки');
}
