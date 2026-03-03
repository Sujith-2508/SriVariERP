# Data Handling & Schema Documentation

This document explains the data handling processes, schemas for Suppliers and Dealers in Supabase, Google Sheets backup mechanisms, and how CRUD operations from the Desktop/Mobile UI are synced to the database and external sheets.

---

## 1. Dealers (Customers) Data Handling

### 1.1 Supabase Schema
Dealers represent the business partners or retailers. In Supabase, the core data is divided into several relational tables.

#### Table: `dealers`
Stores the master data of each dealer.
- `id` (UUID): Unique identifier.
- `business_name` (Text): Name of the business.
- `contact_person` (Text): Name of the primary contact.
- `phone` (Text): Contact number.
- `district` / `city` / `pin_code` / `address`: Location details.
- `gst_number` (Text): Tax identification number.
- `balance` (Decimal): Current outstanding balance.
- `last_transaction_date` (Timestamp): Date of the last transaction.

#### Table: `transactions`
Stores both generated invoices and received payments for the dealers.
- `customer_id` (UUID): Foreign key linking to the `dealers` table.
- `type` (Enum): `INVOICE` or `PAYMENT`.
- `amount` (Decimal): Total amount of the transaction.
- `date` (Timestamp): Transaction date.
- `reference_id` (Text): Invoice number or Payment reference.
- Additional fields: `agent_name`, `due_date`, `transport_charges`, etc.

#### Table: `invoice_items`
Stores the individual line items for each invoice transaction.
- `transaction_id` (UUID): Links to the `transactions` table.
- `product_id`, `product_name`, `quantity`, `unit_price`, `gst_amount`, `discount`, `total`: Line item details.

#### Table: `payment_allocations`
Tracks FIFO (First-In-First-Out) allocations mapping a payment receipt to specific invoices to resolve outstanding balances.

---

## 2. Suppliers Data Handling

### 2.1 Supabase Schema
Suppliers represent the entities providing goods/inventory to the business. 

#### Table: `suppliers`
- `id` (UUID): Unique identifier.
- `name` (Text): Supplier's business name.
- `contact_person` / `phone` / `email` / `address` / `city`: Contact details.
- `gst_number` (Text): Tax identification number.
- `balance` (Decimal): Credit owed *to* the supplier (positive means money is owed to them).

#### Table: `purchase_bills`
Stores purchase invoices received from suppliers.
- `supplier_id` (UUID): Foreign key linking to `suppliers`.
- `bill_number` (Text): Supplier's invoice number.
- `bill_date` (Date): Invoice date.
- `amount` (Decimal): Total bill amount.
- `paid_amount` (Decimal): Sum of payments already made.
- `balance` (Decimal): Remaining balance (`amount` - `paid_amount`).
- `items` (JSONB): Array holding the purchase line items.

#### Table: `purchase_payments` & `purchase_allocations`
Handle the payments made to the suppliers and map those payments to specific `purchase_bills` via a FIFO method, similar to Dealer payments.

---

## 3. Dealer Statement Backup to Google Sheets

To provide accessible statements and backups, Dealer transactions are continuously backed up into a Google Spreadsheet. Each Dealer gets a dedicated, formatted tab.

### How it Works (`sync_dealer_statements.ts`)
1. **Authentication**: Uses Google Service Account credentials via the Google Drive & Sheets API (`googleapis`).
2. **Data Extraction**: 
   - Fetches all dealers from the `dealers` table.
   - Fetches all invoices (via `mobile_invoice_view`) and payments (`transactions` table where type is `PAYMENT`).
3. **Data Transformation (Ledger Generation)**:
   - Invoice records are logged as **Debits** (increases the dealer's balance due).
   - Payment records are logged as **Credits** (decreases the dealer's balance due).
   - The transactions are sorted chronologically by date.
   - A running `Balance` is calculated down the rows.
4. **Google Sheets Integration**:
   - The script creates a safe tab name using the Dealer's business name (limited to 31 characters and stripped of invalid characters).
   - If the tab doesn't exist, it creates a new sheet tab for that dealer.
   - It populates the sheet with headers: `['Date', 'Ref No', 'Particulars', 'Debit', 'Credit', 'Balance']`.
   - The synchronized rows are completely overwritten/updated to match the current Supabase state securely.

---

## 4. UI CRUD Operations & Synchronization

The Desktop and Mobile applications allow users to interact with the database via standard CRUD (Create, Read, Update, Delete) operations.

### 4.1 Supabase Synchronization (Real-time / API)
- **Create**: When an agent creates a new Invoice or logs a Collection Payment in the App, it calls Supabase `INSERT` on `transactions` and `invoice_items`. Supabase triggers automatically update the `updated_at` timestamps and calculate balances.
- **Read**: The UI uses Supabase `SELECT` queries (e.g., via `DataContext` or `purchaseService`) to render dashboard views, tables, and lists in real-time.
- **Update**: Modifying a dealer's phone number or a supplier's GST number issues an `UPDATE` command to the respective row in Supabase.
- **Delete**: Deleting a record (like a drafted bill or erroneous payment) uses `DELETE`. Due to `ON DELETE CASCADE` constraints in the schema, deleting a transaction automatically deletes its `invoice_items` or `payment_allocations`.

### 4.2 Google Sheets Synchronization Reflection
Supabase serves as the single source of truth. The Google Sheets backup does *not* receive direct API events from the UI CRUD actions on an individual basis. Instead:
- When a CRUD operation alters Dealer transactions in the UI, Supabase is immediately updated.
- The `sync_dealer_statements.ts` script (or a corresponding cloud function/cron job) is executed.
- The script pulls the aggregated, updated list from Supabase.
- The Google Sheet Tabs are then refreshed. 
- *Impact*: An invoice created in the Mobile App immediately shows in the Supabase Dashboard, and upon the next sync cycle, will cleanly appear as a new Debit line item in the Dealer's Google Sheet Tab.
