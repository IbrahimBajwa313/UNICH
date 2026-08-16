import mongoose, { Schema, models, model } from "mongoose";

const ProductSchema = new Schema(
  {
    sku: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    nameAr: String,
    category: { type: String, required: true },
    unit: { type: String, enum: ["pcs", "ml", "g", "kg"], required: true },
    sellPrice: { type: Number, required: true, default: 0 },
    wholesalePrice: { type: Number, default: 0 },
    minMarginPct: { type: Number, required: true, default: 0 },
    costFifo: { type: Number, required: true, default: 0 },
    brand: { type: String, default: "" },
    concentration: { type: String, default: "" },
    gender: { type: String, default: "" },
    size: { type: String, default: "" },
    collection: { type: String, default: "" },
    notes: { type: String, default: "" },
    itemType: {
      type: String,
      enum: ["finished", "packaging", "raw"],
      default: "finished",
    },
    importBatchId: { type: String, index: true, default: null },
    stockSellable: { type: Number, required: true, default: 0 },
    stockTester: { type: Number, required: true, default: 0 },
    stockSample: { type: Number, required: true, default: 0 },
    stockPersonal: { type: Number, required: true, default: 0 },
    lowStockAt: { type: Number, required: true, default: 0 },
    isQuickButton: { type: Boolean, default: false },
    tags: [{ type: String }],
    lastSoldAt: Date,
  },
  { timestamps: true },
);

const FifoLayerSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    supplierId: { type: Schema.Types.ObjectId, ref: "Supplier", required: true },
    supplierName: { type: String, required: true },
    purchaseDate: { type: Date, required: true },
    qtyRemaining: { type: Number, required: true },
    unitCost: { type: Number, required: true },
    currency: { type: String, required: true, default: "AED" },
    /** purchase = goods receipt; production = finished goods from a production order */
    source: {
      type: String,
      enum: ["purchase", "production"],
      default: "purchase",
    },
    productionOrderId: {
      type: Schema.Types.ObjectId,
      ref: "ProductionOrder",
      default: null,
    },
  },
  { timestamps: true },
);
// Speeds POS FIFO consume: oldest positive layer per product
FifoLayerSchema.index({ productId: 1, qtyRemaining: 1, purchaseDate: 1 });

const CustomerSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true, index: true },
    email: String,
    preferences: [{ type: String }],
    totalPurchases: { type: Number, default: 0 },
    lastVisit: { type: Date },
    creditBalance: { type: Number, default: 0 },
    hasCustomFormula: { type: Boolean, default: false },
  },
  { timestamps: true },
);

const SupplierSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true },
    currency: { type: String, required: true, default: "AED" },
    creditLimit: { type: Number, default: 0 },
    outstanding: { type: Number, default: 0 },
    lastPurchase: { type: Date },
    avgLeadDays: { type: Number, default: 0 },
  },
  { timestamps: true },
);

const FormulaComponentSchema = new Schema(
  {
    productId: { type: String, required: true },
    productName: { type: String, required: true },
    qty: { type: Number, required: true, min: 0 },
    unit: { type: String, enum: ["pcs", "ml", "g", "kg"], required: true },
  },
  { _id: false },
);

const FormulaAuditSchema = new Schema(
  {
    at: { type: Date, required: true },
    by: String,
    action: {
      type: String,
      enum: ["created", "updated", "status_changed", "restored"],
      required: true,
    },
    detail: String,
    fromStatus: String,
    toStatus: String,
    fromVersion: Number,
    toVersion: Number,
  },
  { _id: false },
);

const FormulaVersionSchema = new Schema(
  {
    version: { type: Number, required: true },
    name: { type: String, required: true },
    type: { type: String, enum: ["remix", "oil", "bakhoor"], required: true },
    status: {
      type: String,
      enum: ["draft", "approved", "rejected", "archived"],
      required: true,
    },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer" },
    customerName: String,
    yieldMl: { type: Number, required: true },
    components: [FormulaComponentSchema],
    notes: String,
    savedAt: { type: Date, required: true },
    savedBy: String,
  },
  { _id: false },
);

const MaterialsReservationSchema = new Schema(
  {
    active: { type: Boolean, default: false },
    reservedAt: Date,
    lines: [
      {
        productId: { type: String, required: true },
        productName: { type: String, required: true },
        qty: { type: Number, required: true, min: 0 },
        unit: { type: String, default: "ml" },
      },
    ],
  },
  { _id: false },
);

const FormulaSchema = new Schema(
  {
    name: { type: String, required: true },
    type: { type: String, enum: ["remix", "oil", "bakhoor"], required: true },
    status: {
      type: String,
      enum: ["draft", "approved", "rejected", "archived"],
      default: "draft",
    },
    version: { type: Number, required: true, default: 1, min: 1 },
    versions: { type: [FormulaVersionSchema], default: [] },
    history: { type: [FormulaAuditSchema], default: [] },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer" },
    customerName: String,
    yieldMl: { type: Number, required: true },
    components: [FormulaComponentSchema],
    notes: String,
    approvedAt: Date,
    approvedBy: String,
    /** BLD-12: auto material reservation — active only when approved. */
    materialsReservation: {
      type: MaterialsReservationSchema,
      default: () => ({ active: false, lines: [] }),
    },
  },
  { timestamps: true },
);
FormulaSchema.index({ updatedAt: -1 });
FormulaSchema.index({ status: 1, updatedAt: -1 });
FormulaSchema.index({ customerId: 1, status: 1 });
FormulaSchema.index({ type: 1, status: 1 });

const PurchaseOrderLineSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    productName: { type: String, required: true },
    sku: { type: String, default: "" },
    qtyOrdered: { type: Number, required: true, min: 0 },
    qtyReceived: { type: Number, required: true, default: 0, min: 0 },
    /** Qty already pushed into FifoLayer — prevents double-apply on re-save. */
    qtyFifoApplied: { type: Number, required: true, default: 0, min: 0 },
    unitCost: { type: Number, required: true, min: 0 },
  },
  { _id: true },
);

const PurchaseOrderSchema = new Schema(
  {
    supplierId: { type: Schema.Types.ObjectId, ref: "Supplier", required: true },
    supplierName: { type: String, required: true },
    date: { type: Date, required: true },
    status: {
      type: String,
      enum: ["draft", "ordered", "received", "partial"],
      default: "draft",
    },
    currency: { type: String, required: true, default: "AED" },
    total: { type: Number, required: true, default: 0 },
    itemCount: { type: Number, required: true, default: 0 },
    lines: { type: [PurchaseOrderLineSchema], default: [] },
    notes: String,
    /** BRN-08 branch isolation */
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", index: true },
    branchName: String,
  },
  { timestamps: true },
);

const QuotationSchema = new Schema(
  {
    number: { type: String, required: true, unique: true },
    customerName: { type: String, required: true },
    customerPhone: { type: String, required: true },
    status: {
      type: String,
      enum: ["draft", "sent", "revised", "approved", "rejected", "expired"],
      default: "draft",
    },
    date: { type: Date, required: true },
    expiry: { type: Date, required: true },
    total: { type: Number, required: true, default: 0 },
    items: { type: Number, required: true, default: 0 },
    convertedToSaleId: { type: Schema.Types.ObjectId, ref: "Sale" },
    /** BRN-08 branch isolation */
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", index: true },
    branchName: String,
  },
  { timestamps: true },
);

const SaleLineSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product" },
    name: { type: String, required: true },
    qty: { type: Number, required: true },
    unitLabel: { type: String, required: true },
    unitPrice: { type: Number, required: true },
    lineType: {
      type: String,
      enum: ["ready", "remix", "oil", "refill", "packaging", "wholesale"],
      required: true,
    },
    bomNote: String,
    deductMl: Number,
    oilProductId: { type: Schema.Types.ObjectId, ref: "Product" },
    oilMl: Number,
    formulaId: { type: Schema.Types.ObjectId, ref: "Formula" },
    packagingProductIds: [{ type: Schema.Types.ObjectId, ref: "Product" }],
  },
  { _id: false },
);

const InventoryDeductionBatchSchema = new Schema(
  {
    layerId: { type: Schema.Types.ObjectId, ref: "FifoLayer", required: true },
    qty: { type: Number, required: true },
    unitCost: { type: Number, required: true },
    purchaseDate: { type: Date, required: true },
  },
  { _id: false },
);

const InventoryDeductionSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    productName: { type: String, required: true },
    qty: { type: Number, required: true },
    reason: { type: String, required: true },
    lineIndex: { type: Number, required: true },
    costTotal: { type: Number, required: true, default: 0 },
    batches: [InventoryDeductionBatchSchema],
  },
  { _id: false },
);

const SaleSchema = new Schema(
  {
    customerPhone: { type: String, required: true },
    customerName: { type: String, default: "Walk-in" },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer" },
    salesperson: { type: String, required: true, trim: true, index: true },
    payment: {
      type: String,
      enum: ["cash", "card", "bank", "credit", "mixed"],
      required: true,
    },
    status: {
      type: String,
      enum: ["completed", "held", "void"],
      default: "completed",
    },
    lines: [SaleLineSchema],
    subtotal: { type: Number, required: true },
    total: { type: Number, required: true },
    saleType: {
      type: String,
      enum: ["Retail", "Wholesale", "Remix", "Oil", "Refill", "Mixed"],
      default: "Retail",
    },
    idempotencyKey: {
      type: String,
      sparse: true,
      unique: true,
      index: true,
    },
    inventoryDeductions: [InventoryDeductionSchema],
    /** BRN-08 branch isolation */
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", index: true },
    branchName: String,
  },
  { timestamps: true },
);

const DeliveryLogSchema = new Schema(
  {
    channel: {
      type: String,
      enum: ["print", "email", "whatsapp", "sms"],
      required: true,
      index: true,
    },
    kind: {
      type: String,
      enum: ["receipt", "quotation", "custom"],
      required: true,
    },
    status: {
      type: String,
      enum: ["sent", "failed", "handoff", "printed"],
      required: true,
    },
    saleId: { type: Schema.Types.ObjectId, ref: "Sale", index: true },
    quotationId: { type: Schema.Types.ObjectId, ref: "Quotation" },
    receiptNo: { type: String, default: "" },
    to: { type: String, default: "" },
    format: { type: String, default: "" },
    providerId: { type: String, default: "" },
    error: { type: String, default: "" },
    preview: { type: String, default: "" },
  },
  { timestamps: true },
);

const ExpenseSchema = new Schema(
  {
    date: { type: Date, required: true },
    category: { type: String, required: true },
    detail: { type: String, required: true },
    amount: { type: Number, required: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    /** BRN-08 branch isolation */
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", index: true },
    branchName: String,
  },
  { timestamps: true },
);

const AppSettingsSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    branchName: { type: String, default: "Main Store — Dubai" },
    currency: { type: String, default: "AED" },
    uiLanguage: { type: String, default: "English" },
    invoiceLanguages: { type: String, default: "English + Arabic" },
    qtyPrecision: { type: Number, default: 3 },
    inventoryMethod: { type: String, default: "FIFO" },
    workingHours: { type: String, default: "10:00 – 22:00" },
    fridayHours: { type: String, default: "16:30 – 22:00" },
    minMarginGuard: { type: String, default: "Admin password required" },
    storeLegalName: { type: String, default: "" },
    storeAddress: { type: String, default: "" },
    storePhone: { type: String, default: "" },
    storeTaxNumber: { type: String, default: "" },
    receiptLogoUrl: { type: String, default: "" },
    receiptFooter: {
      type: String,
      default: "Thank you for shopping with UNICH.",
    },
    /** Shelf prices are VAT-inclusive; 0 disables the tax breakdown on receipts. */
    vatPercent: { type: Number, default: 0 },
    receiptFormat: {
      type: String,
      enum: ["thermal", "a4"],
      default: "thermal",
    },
    autoPrintReceipt: { type: Boolean, default: false },
    currentUserName: { type: String, default: "Ahmad Ibrahim" },
    currentUserRole: { type: String, default: "admin" },
    currentUserRoleLabel: { type: String, default: "Admin" },
    salespeople: {
      type: [{ type: String, trim: true }],
      default: ["Ahmad Ibrahim"],
    },
    activeSalesperson: {
      type: String,
      trim: true,
      default: "Ahmad Ibrahim",
    },
    pettyCashFloat: { type: Number, default: 500 },
    integrations: [
      {
        name: String,
        status: String,
      },
    ],
    roles: [
      {
        role: String,
        access: [String],
      },
    ],
  },
  { timestamps: true },
);

const ImportBatchRowSchema = new Schema(
  {
    rowNumber: { type: Number, required: true },
    action: {
      type: String,
      enum: ["create", "update", "error"],
      required: true,
    },
    sku: { type: String, default: "" },
    payload: { type: Schema.Types.Mixed },
    errorReason: { type: String, default: "" },
    previousProductSnapshot: { type: Schema.Types.Mixed },
    createdProductId: { type: Schema.Types.ObjectId, ref: "Product" },
    priceFloorViolation: { type: Boolean, default: false },
  },
  { _id: false },
);

const ImportBatchSchema = new Schema(
  {
    batchId: { type: String, required: true, unique: true, index: true },
    userName: { type: String, required: true },
    fileName: { type: String, required: true },
    status: {
      type: String,
      enum: ["staged", "committed", "undone"],
      default: "staged",
    },
    total: { type: Number, default: 0 },
    created: { type: Number, default: 0 },
    updated: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    priceFloorCount: { type: Number, default: 0 },
    rawRows: { type: Schema.Types.Mixed, default: [] },
    rows: [ImportBatchRowSchema],
  },
  { timestamps: true },
);

const ProductionConsumeBatchSchema = new Schema(
  {
    layerId: { type: Schema.Types.ObjectId, ref: "FifoLayer", required: true },
    qty: { type: Number, required: true },
    unitCost: { type: Number, required: true },
    purchaseDate: { type: Date, required: true },
  },
  { _id: false },
);

const ProductionPlannedLineSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    productName: { type: String, required: true },
    qty: { type: Number, required: true, min: 0 },
    unit: { type: String, default: "ml" },
    reason: { type: String, required: true },
  },
  { _id: false },
);

const ProductionConsumptionSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    productName: { type: String, required: true },
    qty: { type: Number, required: true },
    reason: { type: String, required: true },
    costTotal: { type: Number, required: true, default: 0 },
    batches: [ProductionConsumeBatchSchema],
  },
  { _id: false },
);

const ProductionBatchSchema = new Schema(
  {
    batchNumber: { type: String, required: true },
    producedAt: { type: Date, required: true },
    outputProductId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    outputProductName: { type: String, required: true },
    outputSku: { type: String, default: "" },
    outputQty: { type: Number, required: true, min: 0 },
    outputUnit: { type: String, required: true },
    unitCost: { type: Number, required: true, default: 0 },
    totalMaterialCost: { type: Number, required: true, default: 0 },
    fifoLayerId: { type: Schema.Types.ObjectId, ref: "FifoLayer" },
  },
  { _id: false },
);

const ProductionOrderSchema = new Schema(
  {
    orderNumber: { type: String, required: true, unique: true, index: true },
    formulaId: { type: Schema.Types.ObjectId, ref: "Formula", required: true },
    formulaName: { type: String, required: true },
    formulaType: {
      type: String,
      enum: ["remix", "oil", "bakhoor"],
      required: true,
    },
    formulaVersion: { type: Number, required: true, default: 1 },
    /** Number of formula runs (e.g. bottles to produce). */
    qty: { type: Number, required: true, min: 1 },
    /** BLD-06 expected yield (formula.yieldMl × qty). */
    yieldMl: { type: Number, required: true, default: 0 },
    /** BLD-06 actual measured yield on complete. */
    actualYieldMl: { type: Number },
    /** BLD-06: actual − expected. */
    varianceMl: { type: Number },
    /** BLD-06: shortfall when actual < expected. */
    wastageMl: { type: Number },
    /** BLD-06: |variance| ≤ ±5 ml. */
    withinTolerance: { type: Boolean },
    status: {
      type: String,
      enum: ["draft", "completed", "cancelled"],
      default: "draft",
      index: true,
    },
    oilProductId: { type: Schema.Types.ObjectId, ref: "Product" },
    oilProductName: String,
    outputProductId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    outputProductName: { type: String, required: true },
    outputSku: { type: String, default: "" },
    outputUnit: { type: String, required: true },
    /** Finished goods qty to add on complete. */
    outputQty: { type: Number, required: true, min: 0 },
    plannedLines: { type: [ProductionPlannedLineSchema], default: [] },
    consumption: { type: [ProductionConsumptionSchema], default: [] },
    batch: { type: ProductionBatchSchema, default: null },
    notes: String,
    createdBy: String,
    completedAt: Date,
    completedBy: String,
    cancelledAt: Date,
  },
  { timestamps: true },
);
ProductionOrderSchema.index({ createdAt: -1 });
ProductionOrderSchema.index({ status: 1, createdAt: -1 });

export const Product = models.Product || model("Product", ProductSchema);
export const FifoLayer = models.FifoLayer || model("FifoLayer", FifoLayerSchema);
export const Customer = models.Customer || model("Customer", CustomerSchema);
export const Supplier = models.Supplier || model("Supplier", SupplierSchema);
export const Formula = models.Formula || model("Formula", FormulaSchema);
export const PurchaseOrder =
  models.PurchaseOrder || model("PurchaseOrder", PurchaseOrderSchema);
export const Quotation = models.Quotation || model("Quotation", QuotationSchema);
export const Sale = models.Sale || model("Sale", SaleSchema);
export const Expense = models.Expense || model("Expense", ExpenseSchema);
export const DeliveryLog =
  models.DeliveryLog || model("DeliveryLog", DeliveryLogSchema);
export const AppSettings =
  models.AppSettings || model("AppSettings", AppSettingsSchema);
export const ImportBatch =
  models.ImportBatch || model("ImportBatch", ImportBatchSchema);
export const ProductionOrder =
  models.ProductionOrder || model("ProductionOrder", ProductionOrderSchema);

/** INV-07 audit trail for stock adjustments / wastage. */
const InventoryAdjustmentSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    productName: { type: String, required: true },
    qty: { type: Number, required: true, min: 0 },
    direction: { type: String, enum: ["in", "out"], required: true },
    reason: {
      type: String,
      enum: ["wastage_cost", "wastage_customer", "restock", "adjustment"],
      required: true,
    },
    /** INV-07: cost vs customer-paid liability. */
    liability: {
      type: String,
      enum: ["cost", "customer_paid"],
    },
    costTotal: { type: Number, default: 0 },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer" },
    customerName: String,
    customerPhone: String,
    saleId: { type: Schema.Types.ObjectId, ref: "Sale" },
    expenseId: { type: Schema.Types.ObjectId, ref: "Expense" },
    notes: String,
    createdBy: String,
    /** BRN-08 branch isolation */
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", index: true },
    branchName: String,
  },
  { timestamps: true },
);
InventoryAdjustmentSchema.index({ createdAt: -1 });
InventoryAdjustmentSchema.index({ productId: 1, createdAt: -1 });

export const InventoryAdjustment =
  models.InventoryAdjustment ||
  model("InventoryAdjustment", InventoryAdjustmentSchema);

/** BRN-08: physical / logical store for branch isolation. */
const BranchSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

/** BRN-08: login identity with role + branch. */
const UserSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ["super_admin", "admin", "sales", "accountant", "inventory"],
      required: true,
      index: true,
    },
    roleLabel: { type: String, required: true },
    branchId: {
      type: Schema.Types.ObjectId,
      ref: "Branch",
      default: null,
      index: true,
    },
    branchName: { type: String, default: null },
    active: { type: Boolean, default: true, index: true },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const Branch = models.Branch || model("Branch", BranchSchema);
export const User = models.User || model("User", UserSchema);

/** Login rate-limit sliding window — one document per key (ip:X or email:X). */
const RateLimitSchema = new Schema({
  key: { type: String, required: true, unique: true },
  attempts: [{ type: Date }],
  expiresAt: { type: Date, required: true },
});
RateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RateLimit = models.RateLimit || model("RateLimit", RateLimitSchema);
