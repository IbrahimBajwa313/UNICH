# U-niche Perfumes ERP

Professional cloud ERP playground for **U-niche Perfumes**, built by TechCognify.

## Stack

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS v4
- Lucide icons

## Getting started

```bash
npm install
# Add MongoDB Atlas connection string to .env as DATABASE_URL
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Database scripts

```bash
npm run db:seed    # wipe + seed collections from scripts/seed.ts
npm run db:health  # verify Atlas connection + document counts
```

All business data lives in MongoDB Atlas. The UI loads through `/api/*` routes — no in-app mock arrays.

## Receipt delivery (POS-11)

A completed sale can be delivered on four channels from the POS bill panel:

| Channel | How it works | Configuration |
|---------|--------------|---------------|
| Print | Renders an 80mm thermal or A4 document server-side and opens the browser print dialog, so any installed thermal printer (or Save-as-PDF) can be used | `Settings → Receipt & Invoice` |
| WhatsApp | Builds a `wa.me` deep link with the receipt text and opens it for the cashier to send | `WHATSAPP_NUMBER` |
| Email | Sends the receipt text plus the A4 invoice as HTML through Resend | `EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_FROM` |
| SMS | Sends a short receipt summary through the Twilio REST API | `SMS_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` (or `TWILIO_MESSAGING_SERVICE_SID`) |

The SMS button stays disabled until Twilio credentials are present. Every attempt on
every channel is written to the `deliverylogs` collection and can be read back from
`GET /api/notifications/log?saleId=…`.

Receipt numbers (`INV-YYYYMMDD-XXXXXX`) are derived from the sale id, so a reprint of
the same sale always carries the same number and is stamped `REPRINT`. Printing a live
cart before checkout produces a `DRAFT — NOT A TAX INVOICE` copy.

Shelf prices are treated as VAT-inclusive: setting `VAT %` in Settings splits the tax
out of the amount charged instead of adding it on top, so the printed total always
matches the recorded sale total.

Relevant endpoints:

```
GET  /api/sales/[id]/receipt?format=thermal|a4&reprint=1   # receipt HTML (add as=json for the data)
POST /api/receipts/preview                                 # draft bill HTML from a live cart
POST /api/notifications/send                               # { channels: ["whatsapp","email","sms"], saleId }
GET  /api/notifications/log?saleId=…                       # delivery audit trail
```

## Playground modules

| Module | Route | Notes |
|--------|-------|-------|
| Dashboard | `/` | KPIs, alerts, roadmap |
| POS Terminal | `/pos` | Interactive cart, remix, oil/tola, refill |
| Inventory | `/inventory` | FIFO layers, stock buckets |
| Formulas & BOM | `/formulas` | Admin-gated formula vault |
| Purchasing | `/purchases` | Suppliers & POs |
| Customers | `/customers` | CRM + saved formulas |
| Quotations | `/quotations` | Status lifecycle + convert |
| Reports | `/reports` | Sales / stock / margin shells |
| Expenses | `/expenses` | Petty cash & closing stub |
| Settings | `/settings` | RBAC & integrations |
| Feature Map | `/playground` | Phase 1 build map |

## Phase 1 priorities

1. POS & Sales  
2. Inventory with FIFO  
3. Perfume Formula / BOM engine  
4. Purchase & suppliers  
5. CRM  
6. Quotations  
7. Reporting  
8. Accounting sync  
9. Shopify  
10. RBAC  
11. Excel import  
12. WhatsApp & Email  

All data in this playground is **mock** — ready to replace with a real backend feature-by-feature.
