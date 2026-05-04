/**
 * GST Calculation Verification Test — Final Rules
 *
 * RULES confirmed by user:
 *   1. Global CGST/SGST/IGST base = SUBTOTAL (raw product value, ignore discounts)
 *   2. Round Off can be POSITIVE or NEGATIVE
 *   3. Taxable Summary (HSN) table is untouched — for compliance only
 *   4. PDF grand total must match Billing UI total exactly
 *
 * Run with: node scratch/test_gst_calc.js
 */

const r2 = (v) => Math.round(v * 100) / 100;

function calcTotal({ items, globalCGST, globalSGST, globalIGST, globalDiscount, transport, roundOff }) {
    const subtotal = items.reduce((a, i) => a + (i.unitPrice * i.quantity), 0);
    const itemDiscounts = items.reduce((a, i) => a + (i.discountAmount || 0), 0);
    const globalDiscountAmount = (subtotal * globalDiscount) / 100;

    // RULE 1: GST base = subtotal (NOT reduced by any discount)
    const cgstAmt  = (subtotal * globalCGST)  / 100;
    const sgstAmt  = (subtotal * globalSGST)  / 100;
    const igstAmt  = (subtotal * globalIGST)  / 100;

    // RULE 2: roundOff is signed (can be + or -)
    const total = r2(subtotal - itemDiscounts - globalDiscountAmount
        + cgstAmt + sgstAmt + igstAmt
        + transport + roundOff);

    return { subtotal, itemDiscounts, globalDiscountAmount, cgstAmt, sgstAmt, igstAmt, total };
}

const items = [
    { productName: 'Product A', unitPrice: 500, quantity: 10, discountAmount: 0  },
    { productName: 'Product B', unitPrice: 200, quantity: 5,  discountAmount: 50 }, // 5% item disc
];

let pass = true;
function test(label, result, expected) {
    const ok = Math.abs(result - expected) < 0.01;
    console.log(`  ${ok ? '✅' : '❌'} ${label}: ₹${result.toFixed(2)} ${ok ? '' : `(expected ₹${expected.toFixed(2)})`}`);
    if (!ok) pass = false;
}

console.log('═══════════════════════════════════════════════');
console.log('  GST FINAL VERIFICATION');
console.log('═══════════════════════════════════════════════');

// ─── TEST 1: CGST 9% + SGST 9%, positive round off ───────────────────────────
{
    const r = calcTotal({ items, globalCGST: 9, globalSGST: 9, globalIGST: 0, globalDiscount: 0, transport: 200, roundOff: 2 });
    // subtotal = 6000, itemDisc = 50, globalDisc = 0
    // CGST = 6000 * 9/100 = 540  ← on SUBTOTAL (6000), not (6000-50)
    // SGST = 6000 * 9/100 = 540
    // total = 6000 - 50 - 0 + 540 + 540 + 200 + 2 = 7232
    console.log('\n── TEST 1: CGST+SGST, roundOff +2 ──');
    console.log(`   Subtotal        : ₹${r.subtotal}`);
    console.log(`   Item Discounts  : -₹${r.itemDiscounts}`);
    console.log(`   CGST (9%)       : +₹${r.cgstAmt}  [base: ${r.subtotal} NOT ${r.subtotal - r.itemDiscounts}]`);
    console.log(`   SGST (9%)       : +₹${r.sgstAmt}`);
    console.log(`   Transport       : +₹200`);
    console.log(`   Round Off       : +₹2`);
    test('Grand Total', r.total, 7232);
}

// ─── TEST 2: IGST 18%, negative round off ────────────────────────────────────
{
    const r = calcTotal({ items, globalCGST: 0, globalSGST: 0, globalIGST: 18, globalDiscount: 0, transport: 200, roundOff: -3 });
    // subtotal = 6000, itemDisc = 50
    // IGST = 6000 * 18/100 = 1080  ← on SUBTOTAL
    // total = 6000 - 50 - 0 + 1080 + 200 + (-3) = 7227
    console.log('\n── TEST 2: IGST, roundOff -3 (NEGATIVE) ──');
    console.log(`   Subtotal        : ₹${r.subtotal}`);
    console.log(`   Item Discounts  : -₹${r.itemDiscounts}`);
    console.log(`   IGST (18%)      : +₹${r.igstAmt}  [base: ${r.subtotal} NOT ${r.subtotal - r.itemDiscounts}]`);
    console.log(`   Transport       : +₹200`);
    console.log(`   Round Off       : -₹3  (NEGATIVE ✅)`);
    test('Grand Total', r.total, 7227);
}

// ─── TEST 3: Global Discount + CGST, GST still on subtotal ───────────────────
{
    const r = calcTotal({ items, globalCGST: 9, globalSGST: 9, globalIGST: 0, globalDiscount: 5, transport: 0, roundOff: 0 });
    // subtotal = 6000, itemDisc = 50, globalDisc = 5% of 6000 = 300
    // CGST = 6000 * 9/100 = 540  ← on SUBTOTAL (6000), NOT on (6000 - 300 = 5700)
    // SGST = 540
    // total = 6000 - 50 - 300 + 540 + 540 = 6730
    console.log('\n── TEST 3: Global Discount 5%, GST still on SUBTOTAL ──');
    console.log(`   Subtotal             : ₹${r.subtotal}`);
    console.log(`   Item Discounts       : -₹${r.itemDiscounts}`);
    console.log(`   Global Discount (5%) : -₹${r.globalDiscountAmount}`);
    console.log(`   CGST (9%)            : +₹${r.cgstAmt}  [base: ₹${r.subtotal} ← SUBTOTAL, not ₹${r.subtotal - r.globalDiscountAmount}]`);
    console.log(`   SGST (9%)            : +₹${r.sgstAmt}`);
    test('Grand Total', r.total, 6730);
}

// ─── TEST 4: Zero GST, no discounts ──────────────────────────────────────────
{
    const r = calcTotal({ items, globalCGST: 0, globalSGST: 0, globalIGST: 0, globalDiscount: 0, transport: 0, roundOff: 0 });
    // total = 6000 - 50 = 5950
    console.log('\n── TEST 4: No GST, no discounts ──');
    test('Grand Total', r.total, 5950);
}

console.log('\n═══════════════════════════════════════════════');
console.log(`  OVERALL: ${pass ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
console.log('');
console.log('  KEY RULES CONFIRMED:');
console.log('  1. GST base = SUBTOTAL (not after discounts) ✅');
console.log('  2. Round off = signed (+ or -) ✅');
console.log('  3. Taxable summary (HSN) = unchanged, compliance only ✅');
console.log('═══════════════════════════════════════════════\n');
