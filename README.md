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
