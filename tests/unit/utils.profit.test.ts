import { describe, expect, it } from 'vitest';

import { calculateCOGS, calculateInvoiceProfit, getDealerProfitSummary, getISTDateString } from '@/lib/utils';
import { type InvoiceItem, type Product, type Transaction, TransactionType } from '@/types';

const products: Product[] = [
  {
    id: 'p1',
    productId: 'PROD-001',
    name: 'Natural Rubber',
    category: 'Raw',
    price: 150,
    costPrice: 100,
    stock: 10,
    gstRate: 18,
  },
  {
    id: 'p2',
    productId: 'PROD-002',
    name: 'Synthetic Rubber',
    category: 'Raw',
    price: 120,
    costPrice: 80,
    stock: 20,
    gstRate: 18,
  },
];

function makeInvoice(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'inv-1',
    customerId: 'dealer-1',
    type: TransactionType.INVOICE,
    amount: 1000,
    date: new Date('2026-03-01T00:00:00.000Z'),
    referenceId: 'INV-001',
    items: [],
    ...overrides,
  };
}

describe('calculateCOGS', () => {
  it('prefers item costPrice over product catalog cost', () => {
    const items: InvoiceItem[] = [
      {
        productId: 'p1',
        productName: 'Natural Rubber',
        quantity: 2,
        unitPrice: 150,
        costPrice: 90,
        cgst: 0,
        sgst: 0,
        igst: 0,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 0,
        discount: 0,
        discountAmount: 0,
        total: 300,
      },
    ];

    expect(calculateCOGS(items, products)).toBe(180);
  });

  it('falls back to product lookup when item costPrice is missing', () => {
    const items: InvoiceItem[] = [
      {
        productId: 'PROD-002',
        productName: 'Synthetic Rubber',
        quantity: 3,
        unitPrice: 120,
        cgst: 0,
        sgst: 0,
        igst: 0,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 0,
        discount: 0,
        discountAmount: 0,
        total: 360,
      },
    ];

    expect(calculateCOGS(items, products)).toBe(240);
  });

  it('returns 0 for malformed quantities or costs without NaN leaks', () => {
    const items: InvoiceItem[] = [
      {
        productId: 'p1',
        productName: 'Natural Rubber',
        quantity: Number.NaN,
        unitPrice: 100,
        costPrice: Number.NaN,
        cgst: 0,
        sgst: 0,
        igst: 0,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 0,
        discount: 0,
        discountAmount: 0,
        total: 0,
      },
    ];

    const result = calculateCOGS(items, products);
    expect(result).toBe(0);
    expect(Number.isNaN(result)).toBe(false);
  });
});

describe('getISTDateString', () => {
  it('returns a valid date string even when runtime input date is invalid', () => {
    const result = getISTDateString(new Date('bad-date'));
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('calculateInvoiceProfit', () => {
  it('returns zeroed profit for cheque return notes', () => {
    const invoice = makeInvoice({
      notes: 'Cheque Return: bounced',
      amount: 500,
    });

    const result = calculateInvoiceProfit(invoice, products, 25);

    expect(result).toEqual({
      revenue: 0,
      cogs: 0,
      serviceCharges: 0,
      agentExpenses: 0,
      grossProfit: 0,
      dealerDiscount: 0,
      netProfit: 0,
      profitPercentage: 0,
    });
  });

  it('uses stored COGS and applies dealer discount percent', () => {
    const invoice = makeInvoice({
      amount: 1000,
      cogs: 600,
      discountPercent: 10,
      items: [
        {
          productId: 'p1',
          productName: 'Natural Rubber',
          quantity: 5,
          unitPrice: 200,
          costPrice: 10,
          cgst: 0,
          sgst: 0,
          igst: 0,
          cgstAmount: 0,
          sgstAmount: 0,
          igstAmount: 0,
          discount: 0,
          discountAmount: 0,
          total: 1000,
        },
      ],
    });

    const result = calculateInvoiceProfit(invoice, products, 50);

    expect(result.revenue).toBe(1000);
    expect(result.cogs).toBe(600);
    expect(result.grossProfit).toBe(350);
    expect(result.dealerDiscount).toBe(35);
    expect(result.netProfit).toBe(315);
    expect(result.profitPercentage).toBeCloseTo(31.5, 6);
  });

  it('normalizes malformed numeric inputs and clamps discount percent', () => {
    const invoice = makeInvoice({
      amount: Number.NaN,
      cogs: Number.NaN,
      discountPercent: 250,
      items: [],
    });

    const result = calculateInvoiceProfit(invoice, products, Number.NaN);

    expect(result.revenue).toBe(0);
    expect(result.cogs).toBe(0);
    expect(result.dealerDiscount).toBe(0);
    expect(result.netProfit).toBe(0);
    expect(Number.isNaN(result.profitPercentage)).toBe(false);
  });
});

describe('getDealerProfitSummary', () => {
  it('aggregates invoice profitability and ignores non-invoice transactions', () => {
    const invoiceA = makeInvoice({
      id: 'inv-a',
      amount: 1000,
      cogs: 600,
      discountPercent: 10,
    });

    const invoiceB = makeInvoice({
      id: 'inv-b',
      amount: 500,
      cogs: 400,
      discountPercent: 0,
    });

    const paymentTxn: Transaction = {
      id: 'pay-1',
      customerId: 'dealer-1',
      type: TransactionType.PAYMENT,
      amount: 300,
      date: new Date('2026-03-02T00:00:00.000Z'),
      referenceId: 'PAY-001',
    };

    const summary = getDealerProfitSummary([invoiceA, invoiceB, paymentTxn], products);

    expect(summary.invoiceCount).toBe(2);
    expect(summary.totalRevenue).toBe(1500);
    expect(summary.totalDiscounts).toBe(40);
    expect(summary.totalProfit).toBe(460);
    expect(summary.averageProfitPerInvoice).toBe(230);
    expect(summary.overallProfitPercentage).toBe(30.67);
  });
});
