#!/usr/bin/env node
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fetchDetailedSupplies, fetchFinancialReport, fetchGoodsReturns, fetchIncomes, fetchSales, fetchStocks } from './wb-api.js';
import { aggregateDetailedSupplies, aggregateMovements, aggregateStocks, applyCompensations, classifyFindings, reconcileInventory } from './inventory.js';

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
    await saveAtomic({ version: 2, capturedAt: nowIso, stocks, candidates: {} });
    console.log(`Создан базовый снимок: ${Object.keys(stocks).length} артикулов. Для сверки запустите снова завтра.`);
  } else {
    const from = previous.capturedAt;
    const dateFrom = from.slice(0, 10), dateTo = nowIso.slice(0, 10);
    const [incomes, sales, goodsReturns, finance] = await Promise.all([
      fetchIncomes({ token, dateFrom: from }), fetchSales({ token, dateFrom: from }),
      fetchGoodsReturns({ token, dateFrom, dateTo }), fetchFinancialReport({ token, dateFrom, dateTo })
    ]);
    let supplyAccess = 'unavailable', detailedSupplies = null;
    try { detailedSupplies = aggregateDetailedSupplies(await fetchDetailedSupplies({ token, dateFrom, dateTo })); supplyAccess = 'available'; }
    catch (error) { supplyAccess = error.message; }
    const movements = aggregateMovements(incomes, sales, goodsReturns);
    if (detailedSupplies) movements.accepted = detailedSupplies.accepted;
    let findings = reconcileInventory(previous.stocks, stocks, movements);
    findings = applyCompensations(findings, finance);
    const pendingNmIds = new Set((detailedSupplies?.pending ?? []).flatMap(supply => (supply.goods ?? []).map(row => String(row.nmID ?? row.nmId))));
    for (const finding of findings) {
      finding.supplyEvidence = detailedSupplies?.evidence[finding.nmId] ?? [];
      finding.pendingSupply = pendingNmIds.has(finding.nmId);
    }
    const coverage = { stocks: true, incomes: true, sales: true, sellerReturns: true, finance: true, detailedSupplies: Boolean(detailedSupplies) };
    const classified = classifyFindings(findings, previous.candidates, now, coverage);
    const audit = { version: 2, from, to: nowIso, coverage, supplyAccess, findings: classified.classified };
    await mkdir(path.join(dataDir, 'audits'), { recursive: true });
    await writeFile(path.join(dataDir, 'audits', `${nowIso.replace(/[:.]/g, '-')}.json`), `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
    await saveAtomic({ version: 2, capturedAt: nowIso, stocks, candidates: classified.active });
    console.log(`Артикулов: ${Object.keys(stocks).length}; кандидатов на расхождение: ${findings.length}`);
    for (const item of classified.classified.slice(0, 20)) console.log(`nmID ${item.nmId}: ${item.status}; возможно отсутствует ${item.missing} шт.; блокеры: ${item.blockers.join(', ') || 'нет'}`);
    console.log('Результат является сигналом для проверки, а не доказанной претензией: перемещения и задержки WB могут создавать временные расхождения.');
  }
} catch (error) {
  console.error(`Ошибка: ${error.message}`); process.exitCode = 1;
}
