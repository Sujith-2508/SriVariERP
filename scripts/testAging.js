import { calculateDealerStatement } from '../lib/utils';
import { readFileSync } from 'fs';

// Mock test logic
export function inspectAging(dealers, transactions) {
    const counts = { day0to30: 0, day31to60: 0, day61to90: 0 };
    const now = new Date();
    
    dealers.forEach(dealer => {
        if ((dealer.balance || 0) <= 0) return;
        const dealerTxns = transactions.filter(t => t.customerId === dealer.id);
        const statement = calculateDealerStatement(dealerTxns, dealer.openingBalance || 0, dealer.openingBalanceDate);
        
        statement.invoices
            .filter(inv => inv.referenceId !== 'BAL B/F' && inv.balance > 0)
            .forEach(inv => {
                const ageDays = Math.ceil((now.getTime() - new Date(inv.date).getTime()) / (1000 * 60 * 60 * 24));
                console.log(`Dealer: ${dealer.businessName}, Inv: ${inv.referenceId}, Date: ${inv.date}, Age: ${ageDays}, Balance: ${inv.balance}`);
            });
    });
}
