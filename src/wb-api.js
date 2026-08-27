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
