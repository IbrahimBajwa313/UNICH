// Side-effect imports — each module calls `registerReport` at load time.
// Add new report files here as later phases are built (HR reports wait on
// an Employee/Attendance/Payroll data model that doesn't exist yet).
import "./branchPerformance";
import "./cashClosing";
import "./customersCreditFollowUp";
import "./customersOverview";
import "./expensesByCategory";
import "./formulaMaterialUsage";
import "./inventoryAgeing";
import "./inventoryStatus";
import "./productionBatches";
import "./profitMarginDaily";
import "./purchasesBySupplier";
import "./salesByPaymentMethod";
import "./salesByProduct";
import "./salesBySalesperson";
