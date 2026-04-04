import { describe, expect, it } from 'vitest';

import { calculateDealerStatement } from '@/lib/utils';
import { type Transaction, TransactionType } from '@/types';

function makeTxn(overrides: Partial<Transaction>): Transaction {
  return {
    id: 'txn-default',
    customerId: 'dealer-1',
    type: TransactionType.INVOICE,
    amount: 0,
    date: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('calculateDealerStatement integration', () => {
  it('applies payments using FIFO across invoices', () => {
    const txns: Transaction[] = [
      makeTxn({
        id: 'inv-1',
        type: TransactionType.INVOICE,
        amount: 100,
        date: new Date('2026-01-01T00:00:00.000Z'),
        referenceId: 'INV-001',
      }),
      makeTxn({
        id: 'inv-2',
        type: TransactionType.INVOICE,
        amount: 200,
        date: new Date('2026-01-02T00:00:00.000Z'),
        referenceId: 'INV-002',
      }),
      makeTxn({
        id: 'pay-1',
        type: TransactionType.PAYMENT,
        amount: 150,
        date: new Date('2026-01-03T00:00:00.000Z'),
        referenceId: 'PAY-001',
      }),
      makeTxn({
        id: 'pay-2',
        type: TransactionType.PAYMENT,
        amount: 25,
        date: new Date('2026-01-04T00:00:00.000Z'),
        referenceId: 'PAY-002',
      }),
    ];

    const result = calculateDealerStatement(txns, 50, '2025-12-31');

    const inv1 = result.invoices.find((i) => i.id === 'inv-1');
    const inv2 = result.invoices.find((i) => i.id === 'inv-2');

    expect(inv1?.paid).toBe(100);
    expect(inv1?.balance).toBe(0);
    expect(inv2?.paid).toBe(75);
    expect(inv2?.balance).toBe(125);

    expect(result.summary.openingBalance).toBe(50);
    expect(result.summary.totalInvoiced).toBe(300);
    expect(result.summary.totalPaid).toBe(175);
    expect(result.summary.totalOutstanding).toBe(175);
    expect(result.summary.totalUnapplied).toBe(0);
  });

  it('tracks unapplied payment when payments exceed total invoice value', () => {
    const txns: Transaction[] = [
      makeTxn({
        id: 'inv-1',
        type: TransactionType.INVOICE,
        amount: 100,
        referenceId: 'INV-001',
      }),
      makeTxn({
        id: 'pay-1',
        type: TransactionType.PAYMENT,
        amount: 150,
        referenceId: 'PAY-001',
      }),
    ];

    const result = calculateDealerStatement(txns);

    expect(result.summary.totalInvoiced).toBe(100);
    expect(result.summary.totalPaid).toBe(150);
    expect(result.summary.totalUnapplied).toBe(50);
    expect(result.summary.totalOutstanding).toBe(-50);
  });

  it('does not double count BAL B/F when opening balance is passed separately', () => {
    const txns: Transaction[] = [
      makeTxn({
        id: 'bf-1',
        type: TransactionType.INVOICE,
        amount: 100,
        date: new Date('2026-01-01T00:00:00.000Z'),
        createdAt: new Date('2026-01-01T12:00:00.000Z'),
        referenceId: 'BAL B/F',
      }),
      makeTxn({
        id: 'inv-1',
        type: TransactionType.INVOICE,
        amount: 50,
        date: new Date('2026-01-01T00:00:00.000Z'),
        createdAt: new Date('2026-01-01T13:00:00.000Z'),
        referenceId: 'INV-001',
      }),
      makeTxn({
        id: 'pay-1',
        type: TransactionType.PAYMENT,
        amount: 50,
        date: new Date('2026-01-01T00:00:00.000Z'),
        createdAt: new Date('2026-01-01T10:00:00.000Z'),
        referenceId: 'PAY-001',
      }),
    ];

    const result = calculateDealerStatement(txns, 100, '2025-12-31');

    const bfInvoice = result.invoices.find((i) => i.referenceId === 'BAL B/F');

    expect(bfInvoice?.paid).toBe(50);
    expect(bfInvoice?.balance).toBe(50);

    expect(result.summary.totalInvoiced).toBe(50);
    expect(result.summary.totalPaid).toBe(50);
    expect(result.summary.totalOutstanding).toBe(100);
  });

  it('stays stable with malformed dates and invalid numeric values', () => {
    const txns: Transaction[] = [
      makeTxn({
        id: 'inv-1',
        type: TransactionType.INVOICE,
        amount: 100,
        date: 'bad-date' as unknown as Date,
        referenceId: 'INV-BAD',
      }),
      makeTxn({
        id: 'pay-neg',
        type: TransactionType.PAYMENT,
        amount: -50,
        date: new Date('2026-01-02T00:00:00.000Z'),
        referenceId: 'PAY-NEG',
      }),
    ];

    const result = calculateDealerStatement(txns, Number.NaN);

    expect(result.invoices).toHaveLength(1);
    expect(result.payments).toHaveLength(0);
    expect(Number.isNaN(result.invoices[0].date.getTime())).toBe(false);

    expect(result.summary.openingBalance).toBe(0);
    expect(result.summary.totalInvoiced).toBe(100);
    expect(result.summary.totalPaid).toBe(0);
    expect(result.summary.totalOutstanding).toBe(100);
    expect(Number.isNaN(result.summary.totalOutstanding)).toBe(false);
  });
});
