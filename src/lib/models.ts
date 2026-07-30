import mongoose, { Schema, models, model } from "mongoose";

const ProductSchema = new Schema(
  {
    sku: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    nameAr: String,
    category: { type: String, required: true },
    unit: { type: String, enum: ["pcs", "ml"], required: true },
    sellPrice: { type: Number, required: true, default: 0 },
    minMarginPct: { type: Number, required: true, default: 0 },
    costFifo: { type: Number, required: true, default: 0 },
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
  },
  { timestamps: true },
);

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
    qty: { type: Number, required: true },
    unit: { type: String, enum: ["pcs", "ml"], required: true },
  },
  { _id: false },
);

const FormulaSchema = new Schema(
  {
    name: { type: String, required: true },
    type: { type: String, enum: ["remix", "custom", "signature"], required: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer" },
    customerName: String,
    yieldMl: { type: Number, required: true },
    components: [FormulaComponentSchema],
    notes: String,
  },
  { timestamps: true },
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
    notes: String,
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
  },
  { _id: false },
);

const SaleSchema = new Schema(
  {
    customerPhone: { type: String, required: true },
    customerName: { type: String, default: "Walk-in" },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer" },
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
    currentUserName: { type: String, default: "Ahmad Ibrahim" },
    currentUserRole: { type: String, default: "admin" },
    currentUserRoleLabel: { type: String, default: "Admin" },
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
export const AppSettings =
  models.AppSettings || model("AppSettings", AppSettingsSchema);
