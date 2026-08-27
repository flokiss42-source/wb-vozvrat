import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateMovements, aggregateStocks, classifyFindings, reconcileInventory } from '../src/inventory.js';

test('агрегирует полный остаток по артикулу и складам', () => {
  assert.deepEqual(aggregateStocks([
    { nmId: 10, quantity: 2, inWayToClient: 1, inWayFromClient: 1 },
    { nmId: 10, quantityFull: 5 }, { nmId: 20, quantity: 3 }
  ]), { 10: 9, 20: 3 });
});

test('считает уникальные приёмки, продажи и возвраты', () => {
  const income = { incomeId: 1, nmId: 10, barcode: 'x', date: 'd', quantity: 5, status: 'Принято' };
  const result = aggregateMovements([income, income, { ...income, status: 'Не принято', incomeId: 2 }], [
    { nmId: 10, srid: 'sale', saleID: 'S1', forPay: 10 },
    { nmId: 10, srid: 'sale', saleID: 'S1', forPay: 10 },
    { nmId: 10, srid: 'return', saleID: 'R1', forPay: -10 }
  ]);
  assert.deepEqual(result, { accepted: { 10: 5 }, sold: { 10: 1 }, returned: { 10: 1 }, sellerReturned: {}, returnInProgress: {} });
});

test('находит только отрицательные расхождения товарного баланса', () => {
  const findings = reconcileInventory({ 10: 10, 20: 2 }, { 10: 7, 20: 3 }, { accepted: { 10: 5 }, sold: { 10: 4 }, returned: {}, sellerReturned: {}, returnInProgress: {} });
  assert.deepEqual(findings, [{ nmId: '10', before: 10, accepted: 5, sold: 4, returned: 0, sellerReturned: 0, returnInProgress: 0, expected: 11, actual: 7, missing: 4 }]);
});

test('учитывает возврат продавцу и блокирует товар в пути', () => {
  const movements = aggregateMovements([], [], [
    { nmId: 10, shkId: 1, completedDt: '2026-01-01', isStatusActive: 0 },
    { nmId: 10, shkId: 2, completedDt: null, isStatusActive: 1 }
  ]);
  assert.equal(movements.sellerReturned[10], 1); assert.equal(movements.returnInProgress[10], 1);
});

test('не разрешает претензию без срока и полного покрытия источников', () => {
  const finding = { nmId: '10', missing: 2, returnInProgress: 0 };
  const firstSeen = '2026-08-01T00:00:00.000Z';
  const partial = classifyFindings([finding], { 10: { firstSeen } }, new Date('2026-08-20T00:00:00Z'), { stocks: true });
  assert.equal(partial.classified[0].status, 'Вероятная потеря'); assert.ok(partial.classified[0].blockers.length);
  const full = classifyFindings([finding], { 10: { firstSeen } }, new Date('2026-08-20T00:00:00Z'),
    { stocks: true, incomes: true, sales: true, sellerReturns: true, finance: true, detailedSupplies: true });
  assert.equal(full.classified[0].status, 'Готово к претензии'); assert.deepEqual(full.classified[0].blockers, []);
});
