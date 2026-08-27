#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { parseCsv } from './csv.js';
import { audit, rub } from './audit.js';
import { renderReport } from './report.js';

const [input, outputArg] = process.argv.slice(2);
if (!input || ['-h', '--help'].includes(input)) {
  console.log('Использование: node src/cli.js <детализация.csv> [отчёт.html]');
  process.exit(input ? 0 : 1);
}
try {
  const text = await readFile(path.resolve(input), 'utf8');
  const result = audit(parseCsv(text));
  const output = path.resolve(outputArg || path.join('reports', `audit-${Date.now()}.html`));
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, renderReport(result, path.basename(input)), 'utf8');
  console.log(`Проверено строк: ${result.rows}`);
  console.log(`Найдено сигналов: ${result.findings.length}`);
  console.log(`Потенциальный риск: ${rub(result.risk)}`);
  console.log(`Отчёт: ${output}`);
} catch (error) {
  console.error(`Ошибка: ${error.message}`);
  process.exitCode = 1;
}
