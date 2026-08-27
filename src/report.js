import { rub } from './audit.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export function renderReport(result, source) {
  const cards = [
    ['Потенциальный риск', rub(result.risk)], ['Строк проверено', result.rows],
    ['Продажи', rub(result.totals.sales)], ['К перечислению', rub(result.totals.payout)],
    ['Логистика', rub(result.totals.logistics)], ['Штрафы', rub(result.totals.penalties)]
  ].map(([label, value]) => `<div class="card"><small>${label}</small><strong>${value}</strong></div>`).join('');
  const rows = result.findings.map(item => `<tr><td><span class="${item.severity}">${esc(item.severity)}</span></td><td>${esc(item.reason)}</td><td>${esc(item.article || '—')}</td><td>${esc(item.srid || '—')}</td><td>${rub(item.amount)}</td><td>${esc(item.row)}</td></tr>`).join('');
  return `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>WB Возврат — аудит</title><style>
  :root{font-family:Inter,system-ui,sans-serif;color:#1d1930;background:#f6f4fb}body{max-width:1180px;margin:40px auto;padding:0 20px}h1{margin-bottom:4px}.muted{color:#716b7d}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:28px 0}.card{background:white;border-radius:16px;padding:18px;box-shadow:0 5px 25px #39296910}.card small{display:block;color:#716b7d}.card strong{font-size:22px;display:block;margin-top:8px}table{width:100%;border-collapse:collapse;background:#fff;border-radius:16px;overflow:hidden}th,td{text-align:left;padding:12px;border-bottom:1px solid #eee}th{background:#ede8f7}.high,.critical,.medium{padding:4px 8px;border-radius:99px;font-size:12px}.critical{background:#441020;color:white}.high{background:#ffd7df;color:#86142b}.medium{background:#fff0bf;color:#6b5000}.notice{background:#eee8ff;border-left:4px solid #7c3aed;padding:14px 18px;margin:20px 0}</style>
  <body><h1>WB Возврат</h1><div class="muted">Финансовый аудит файла ${esc(source)} · ${esc(result.generatedAt)}</div><div class="cards">${cards}</div><div class="notice">Сумма риска — очередь для ручной проверки, а не обещанная компенсация. Каждую находку необходимо подтвердить документами WB.</div><h2>Что проверить</h2><table><thead><tr><th>Важность</th><th>Причина</th><th>Артикул</th><th>Заказ</th><th>Сумма</th><th>Строка CSV</th></tr></thead><tbody>${rows || '<tr><td colspan="6">Явных аномалий не найдено</td></tr>'}</tbody></table></body></html>`;
}
