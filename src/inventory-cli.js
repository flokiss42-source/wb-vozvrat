#!/usr/bin/env node
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fetchIncomes, fetchSales, fetchStocks } from './wb-api.js';
import { aggregateMovements, aggregateStocks, reconcileInventory } from './inventory.js';

const token = process.env.WB_API_TOKEN;
const dataDir = path.resolve('.wb-data');
const stateFile = path.join(dataDir, 'inventory.json');
const now = new Date();
const nowIso = now.toISOString();

async function saveAtomic(value) {
  await mkdir(dataDir, { recursive: true });
  const temp = `${stateFile}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temp, stateFile);
}

try {
  let previous = null;
  try { previous = JSON.parse(await readFile(stateFile, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const stockRows = await fetchStocks({ token });
  const stocks = aggregateStocks(stockRows);
  if (!previous) {
    await saveAtomic({ version: 1, capturedAt: nowIso, stocks });
    console.log(`Создан базовый снимок: ${Object.keys(stocks).length} артикулов. Для сверки запустите снова завтра.`);
  } else {
    const from = previous.capturedAt;
    const [incomes, sales] = await Promise.all([fetchIncomes({ token, dateFrom: from }), fetchSales({ token, dateFrom: from })]);
    const movements = aggregateMovements(incomes, sales);
    const findings = reconcileInventory(previous.stocks, stocks, movements);
    const audit = { version: 1, from, to: nowIso, findings };
    await mkdir(path.join(dataDir, 'audits'), { recursive: true });
    await writeFile(path.join(dataDir, 'audits', `${nowIso.replace(/[:.]/g, '-')}.json`), `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
    await saveAtomic({ version: 1, capturedAt: nowIso, stocks });
    console.log(`Артикулов: ${Object.keys(stocks).length}; кандидатов на расхождение: ${findings.length}`);
    for (const item of findings.slice(0, 20)) console.log(`nmID ${item.nmId}: возможно отсутствует ${item.missing} шт. (ожидалось ${item.expected}, есть ${item.actual})`);
    console.log('Результат является сигналом для проверки, а не доказанной претензией: перемещения и задержки WB могут создавать временные расхождения.');
  }
} catch (error) {
  console.error(`Ошибка: ${error.message}`); process.exitCode = 1;
}
