#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { audit, rub } from './audit.js';
import { renderReport } from './report.js';
import { fetchFinancialReport } from './wb-api.js';

const [dateFrom, dateTo, outputArg] = process.argv.slice(2);
if (!dateFrom || !dateTo || ['-h', '--help'].includes(dateFrom)) {
  console.log('Использование: WB_API_TOKEN=<токен> npm run audit:api -- ГГГГ-ММ-ДД ГГГГ-ММ-ДД [отчёт.html]');
  process.exit(dateFrom ? 0 : 1);
}
try {
  const rows = await fetchFinancialReport({ token: process.env.WB_API_TOKEN, dateFrom, dateTo });
  const result = audit(rows);
  const output = path.resolve(outputArg || path.join('reports', `wb-${dateFrom}-${dateTo}.html`));
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, renderReport(result, `WB API: ${dateFrom} — ${dateTo}`), 'utf8');
  console.log(`Проверено строк: ${result.rows}`);
  console.log(`Найдено сигналов: ${result.findings.length}`);
  console.log(`Потенциальный риск: ${rub(result.risk)}`);
  console.log(`Отчёт: ${output}`);
} catch (error) {
  console.error(`Ошибка: ${error.message}`);
  process.exitCode = 1;
}
