import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateMovements, aggregateStocks, reconcileInventory } from '../src/inventory.js';

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
  assert.deepEqual(result, { accepted: { 10: 5 }, sold: { 10: 1 }, returned: { 10: 1 } });
});

test('находит только отрицательные расхождения товарного баланса', () => {
  const findings = reconcileInventory({ 10: 10, 20: 2 }, { 10: 7, 20: 3 }, { accepted: { 10: 5 }, sold: { 10: 4 }, returned: {} });
  assert.deepEqual(findings, [{ nmId: '10', before: 10, accepted: 5, sold: 4, returned: 0, expected: 11, actual: 7, missing: 4 }]);
});
