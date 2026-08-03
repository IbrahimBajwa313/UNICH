export type UserRole =
  | "super_admin"
  | "admin"
  | "sales"
  | "accountant"
  | "inventory";

export type ProductCategory =
  | "Brand Perfumes"
  | "Signature Brand"
  | "Customized Perfumes"
  | "Perfume Oils"
  | "Oud Oils"
  | "Itar"
  | "Body Mist"
  | "Roll-ons"
  | "Deodorants"
  | "Bakhoor"
  | "Incense Burners"
  | "Gift Boxes"
  | "Perfume Sets"
  | "Single Notes"
  | "Mass Perfumes"
  | "Packaging";

export type StockUnit = "pcs" | "ml" | "g" | "kg";
export type StockBucket = "sellable" | "tester" | "sample" | "personal";
export type ItemType = "finished" | "packaging" | "raw";
export type Concentration =
  | "EDT"
  | "EDP"
  | "Extrait"
  | "Parfum"
  | "Oil"
  | "Mist"
  | "Other";

export type ImportRowAction = "create" | "update" | "error";
export type ImportBatchStatus = "staged" | "committed" | "undone";

export type PaymentMethod = "cash" | "card" | "bank" | "credit" | "mixed";

export type QuotationStatus =
  | "draft"
  | "sent"
  | "revised"
  | "approved"
  | "rejected"
  | "expired";

export interface Product {
  id: string;
  sku: string;
  name: string;
  nameAr?: string;
  category: ProductCategory;
  unit: StockUnit;
  sellPrice: number;
  wholesalePrice?: number;
  minMarginPct: number;
  costFifo: number;
  brand?: string;
  concentration?: string;
  gender?: string;
  size?: string;
  collection?: string;
  notes?: string;
  itemType?: ItemType;
  importBatchId?: string | null;
  stockSellable: number;
  stockTester: number;
  stockSample: number;
  stockPersonal: number;
  lowStockAt: number;
  isQuickButton?: boolean;
  tags?: string[];
}

export interface ImportBatchRow {
  rowNumber: number;
  action: ImportRowAction;
  sku: string;
  payload?: Record<string, unknown>;
  errorReason?: string;
  priceFloorViolation?: boolean;
}

export interface ImportBatchSummary {
  batchId: string;
  fileName: string;
  status: ImportBatchStatus;
  total: number;
  created: number;
  updated: number;
  failed: number;
  priceFloorCount: number;
  rows: ImportBatchRow[];
}

export interface FifoLayer {
  id: string;
  productId: string;
  supplierId: string;
  supplierName: string;
  purchaseDate: string;
  qtyRemaining: number;
  unitCost: number;
  currency: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  preferences: string[];
  totalPurchases: number;
  lastVisit: string;
  creditBalance: number;
  hasCustomFormula: boolean;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  currency: string;
  creditLimit: number;
  outstanding: number;
  lastPurchase: string;
  avgLeadDays: number;
}

export interface FormulaComponent {
  productId: string;
  productName: string;
  qty: number;
  unit: StockUnit;
}

export type FormulaStatus = "draft" | "approved" | "rejected" | "archived";

export type FormulaAuditAction =
  | "created"
  | "updated"
  | "status_changed"
  | "restored";

/** Append-only change log (separate from recipe version snapshots). */
export interface FormulaAuditEntry {
  at: string;
  by?: string;
  action: FormulaAuditAction;
  detail?: string;
  fromStatus?: FormulaStatus;
  toStatus?: FormulaStatus;
  fromVersion?: number;
  toVersion?: number;
}

/** BLD-02 fixed BOM/formula types — not PRD-01 product categories. */
export type FormulaType = "remix" | "oil" | "bakhoor";

/** Snapshot of a formula recipe before an edit (immutable history). */
export interface FormulaVersion {
  version: number;
  name: string;
  type: FormulaType;
  status: FormulaStatus;
  customerId?: string;
  customerName?: string;
  yieldMl: number;
  components: FormulaComponent[];
  notes?: string;
  savedAt: string;
  savedBy?: string;
}

export interface Formula {
  id: string;
  name: string;
  type: FormulaType;
  status: FormulaStatus;
  /** Current recipe revision (starts at 1). */
  version: number;
  /** Prior revisions; newest push last. */
  versions: FormulaVersion[];
  /** Audit / change log. */
  history: FormulaAuditEntry[];
  customerId?: string;
  customerName?: string;
  yieldMl: number;
  components: FormulaComponent[];
  notes?: string;
  approvedAt?: string;
  approvedBy?: string;
  updatedAt: string;
}

export interface PurchaseOrderLine {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  qtyOrdered: number;
  qtyReceived: number;
  qtyFifoApplied: number;
  unitCost: number;
}

export interface PurchaseOrder {
  id: string;
  supplierId: string;
  supplierName: string;
  date: string;
  status: "draft" | "ordered" | "received" | "partial";
  currency: string;
  total: number;
  itemCount: number;
  lines: PurchaseOrderLine[];
  notes?: string;
}

export interface Quotation {
  id: string;
  number: string;
  customerName: string;
  customerPhone: string;
  status: QuotationStatus;
  date: string;
  expiry: string;
  total: number;
  items: number;
}

export interface SaleLine {
  id: string;
  productId: string;
  name: string;
  qty: number;
  unit: StockUnit | "tola" | "half_tola" | "quarter_tola";
  unitPrice: number;
  lineType: "ready" | "remix" | "oil" | "refill" | "packaging";
}

export interface DashboardAlert {
  id: string;
  type: "low_stock" | "dead_stock" | "transfer" | "report";
  title: string;
  detail: string;
  severity: "info" | "warning" | "critical";
}

export interface SalesPoint {
  label: string;
  retail: number;
  wholesale: number;
  remix: number;
}

export interface DashboardData {
  stats: {
    todaySales: number;
    grossMarginPct: number;
    remixSales: number;
    lowStockCount: number;
    fifoValue: number;
    weekTotal: number;
    todayExpenseTotal: number;
    productCount: number;
  };
  salesTrend: SalesPoint[];
  alerts: DashboardAlert[];
  recentSales: { id: string; time: string; customer: string; type: string; total: number; payment: string }[];
  lowStock: { id: string; name: string; stockSellable: number; lowStockAt: number; unit: StockUnit }[];
  moduleRoadmap: { name: string; status: string; priority: number }[];
}

export interface Expense {
  id: string;
  date: string;
  category: string;
  detail: string;
  amount: number;
  status: "pending" | "approved" | "rejected";
}

export type DeliveryChannel = "print" | "email" | "whatsapp" | "sms";
export type DeliveryKind = "receipt" | "quotation" | "custom";
export type DeliveryStatus = "sent" | "failed" | "handoff" | "printed";

export interface DeliveryLogEntryRecord {
  id: string;
  channel: DeliveryChannel;
  kind: DeliveryKind;
  status: DeliveryStatus;
  saleId?: string;
  quotationId?: string;
  receiptNo: string;
  to: string;
  format: string;
  providerId: string;
  error: string;
  preview: string;
  createdAt: string;
}

export interface AppSettings {
  id: string;
  branchName: string;
  currency: string;
  uiLanguage: string;
  invoiceLanguages: string;
  qtyPrecision: number;
  inventoryMethod: string;
  workingHours: string;
  fridayHours: string;
  minMarginGuard: string;
  storeLegalName: string;
  storeAddress: string;
  storePhone: string;
  storeTaxNumber: string;
  receiptLogoUrl: string;
  receiptFooter: string;
  vatPercent: number;
  receiptFormat: "thermal" | "a4";
  autoPrintReceipt: boolean;
  /** Read-only: whether SMS credentials are present on the server. */
  smsConfigured?: boolean;
  currentUserName: string;
  currentUserRole: string;
  currentUserRoleLabel: string;
  salespeople: string[];
  activeSalesperson: string;
  integrations: { name: string; status: string }[];
  roles: { role: string; access: string[] }[];
}
