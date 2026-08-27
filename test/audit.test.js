import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCsv, parseNumber } from '../src/csv.js';
import { audit } from '../src/audit.js';
import { renderReport } from '../src/report.js';

test('парсит CSV WB с точкой с запятой, запятыми и кавычками', () => {
  const rows = parseCsv('\uFEFFrrd_id;Артикул WB;Прочие удержания\r\n1;42;"1 250,50"\r\n');
  assert.equal(rows.length, 1); assert.equal(rows[0]['Прочие удержания'], '1 250,50'); assert.equal(rows[0].__row, 2);
  assert.equal(parseNumber(rows[0]['Прочие удержания']), 1250.5);
});

test('не считает десятичную запятую разделителем в semicolon CSV', () => {
  const [row] = parseCsv('id;amount\n1;123,45');
  assert.equal(row.amount, '123,45');
  assert.equal(parseNumber(row.amount), 123.45);
});

test('находит денежные аномалии и дубликаты', () => {
  const rows = parseCsv(`rrd_id;Артикул WB;К перечислению продавцу;Сумма продаж;Прочие удержания;Штрафы;Логистика;srid\n1;100;0;3000;1500;0;100;s1\n1;100;-2000;0;0;1200;100;s1\n2;100;500;1000;0;0;5000;s2\n3;100;500;1000;0;0;100;s3`);
  const result = audit(rows);
  assert.equal(result.rows, 4);
  assert.ok(result.findings.some(x => x.rule === 'duplicate'));
  assert.ok(result.findings.some(x => x.rule === 'deduction'));
  assert.ok(result.findings.some(x => x.rule === 'penalty'));
  assert.ok(result.findings.some(x => x.rule === 'negative-payout'));
  assert.ok(result.findings.some(x => x.rule === 'zero-payout'));
  assert.ok(result.findings.some(x => x.rule === 'logistics-spike'));
  assert.ok(result.risk > 0);
  const maxPerRow = new Map();
  for (const item of result.findings) maxPerRow.set(item.row, Math.max(maxPerRow.get(item.row) ?? 0, item.amount));
  assert.equal(result.risk, [...maxPerRow.values()].reduce((a, b) => a + b, 0));
});

test('экранирует пользовательские данные в HTML', () => {
  const result = audit(parseCsv('rrd_id;Артикул WB;Прочие удержания\n1;<script>alert(1)</script>;2000'));
  const html = renderReport(result, '<bad>.csv');
  assert.doesNotMatch(html, /<script>alert/); assert.match(html, /&lt;script&gt;/); assert.match(html, /&lt;bad&gt;/);
});

test('отклоняет повреждённый CSV', () => {
  assert.throws(() => parseCsv('a;b\n"broken;x'), /Незакрытая/);
  assert.throws(() => parseCsv('a;a\n1;2'), /повторяются/);
});
