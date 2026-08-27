import { parseNumber } from './csv.js';

const aliases = {
  id: ['rrd_id', 'Номер строки', 'ID строки'],
  article: ['nm_id', 'Код номенклатуры', 'Артикул WB'],
  operation: ['supplier_oper_name', 'Обоснование для оплаты', 'Тип операции'],
  document: ['doc_type_name', 'Тип документа'],
  sale: ['retail_amount', 'Вайлдберриз реализовал Товар (Пр)', 'Сумма продаж'],
  payout: ['ppvz_for_pay', 'К перечислению Продавцу за реализованный Товар', 'К перечислению продавцу'],
  logistics: ['delivery_rub', 'Услуги по доставке товара покупателю', 'Логистика'],
  storage: ['storage_fee', 'Хранение'],
  deduction: ['deduction', 'Прочие удержания'],
  penalty: ['penalty', 'Общая сумма штрафов', 'Штрафы'],
  compensation: ['additional_payment', 'Доплаты', 'Компенсация'],
  srid: ['srid', 'Уникальный идентификатор заказа'],
  date: ['rr_dt', 'Дата операции']
};

function pick(row, field) {
  const key = aliases[field].find(name => Object.hasOwn(row, name));
  return key ? row[key] : '';
}

function money(row, field) { return parseNumber(pick(row, field)); }

function median(values) {
  const sorted = values.filter(x => x > 0).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function audit(rows, options = {}) {
  const highAmount = options.highAmount ?? 1000;
  const findings = [];
  const seen = new Map();
  const logisticsByArticle = new Map();

  for (const row of rows) {
    const id = String(pick(row, 'id'));
    if (id) {
      if (seen.has(id)) findings.push(finding('duplicate', 'critical', row, money(row, 'payout'), `Дублируется ID операции ${id} (первая строка ${seen.get(id)})`));
      else seen.set(id, row.__row);
    }
    const article = String(pick(row, 'article') || 'без артикула');
    const logistics = Math.abs(money(row, 'logistics'));
    if (!logisticsByArticle.has(article)) logisticsByArticle.set(article, []);
    if (logistics) logisticsByArticle.get(article).push(logistics);

    const deduction = Math.abs(money(row, 'deduction'));
    const penalty = Math.abs(money(row, 'penalty'));
    const payout = money(row, 'payout');
    const sale = Math.abs(money(row, 'sale'));
    if (deduction >= highAmount) findings.push(finding('deduction', 'high', row, deduction, `Крупное прочее удержание: ${rub(deduction)}`));
    if (penalty >= highAmount) findings.push(finding('penalty', 'high', row, penalty, `Крупный штраф: ${rub(penalty)}`));
    if (payout < 0 && Math.abs(payout) >= highAmount) findings.push(finding('negative-payout', 'high', row, Math.abs(payout), `Отрицательная выплата: ${rub(payout)}`));
    if (sale > 0 && payout === 0 && !/возврат/i.test(String(pick(row, 'document')))) findings.push(finding('zero-payout', 'medium', row, sale, 'Продажа есть, сумма к перечислению равна нулю'));
  }

  for (const row of rows) {
    const article = String(pick(row, 'article') || 'без артикула');
    const value = Math.abs(money(row, 'logistics'));
    const base = median(logisticsByArticle.get(article));
    if (value >= highAmount && base > 0 && value > base * 3) {
      findings.push(finding('logistics-spike', 'medium', row, value - base, `Логистика ${rub(value)} при медиане ${rub(base)} по артикулу`));
    }
  }

  const totals = rows.reduce((sum, row) => ({
    sales: sum.sales + money(row, 'sale'), payout: sum.payout + money(row, 'payout'),
    logistics: sum.logistics + money(row, 'logistics'), deductions: sum.deductions + money(row, 'deduction'),
    penalties: sum.penalties + money(row, 'penalty'), compensation: sum.compensation + money(row, 'compensation')
  }), { sales: 0, payout: 0, logistics: 0, deductions: 0, penalties: 0, compensation: 0 });

  // Several rules may flag the same source row. Counting only its largest
  // exposure prevents a misleading "risk" total from double counting it.
  const riskByRow = new Map();
  for (const item of findings) riskByRow.set(item.row, Math.max(riskByRow.get(item.row) ?? 0, item.amount));
  const risk = [...riskByRow.values()].reduce((sum, amount) => sum + Math.max(0, amount), 0);
  return { generatedAt: new Date().toISOString(), rows: rows.length, totals, risk, findings: findings.sort((a, b) => b.amount - a.amount) };
}

function finding(rule, severity, row, amount, reason) {
  return { rule, severity, row: row.__row, article: String(pick(row, 'article')), srid: String(pick(row, 'srid')), operation: String(pick(row, 'operation')), date: String(pick(row, 'date')), amount, reason };
}

export function rub(value) { return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)} ₽`; }
