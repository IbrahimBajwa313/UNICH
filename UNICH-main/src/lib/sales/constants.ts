/** Required remix BOM roles (oil is customer-selected separately via oil-base). */
export const REMIX_REQUIRED_ROLES = [
  "bottle",
  "cap",
  "atomizer",
  "collar",
  "label",
  "box",
  "ethanol",
  "fixative",
] as const;

export type RemixRequiredRole = (typeof REMIX_REQUIRED_ROLES)[number];

export const OIL_BASE_PRODUCT_ID = "oil-base";

/** BLD-02 / BLD-03: remix always consumes a fixed 20 ml of selected oil (not tola). */
export const REMIX_OIL_ML = 20;

/**
 * BLD-09: customer-supplied refill bottles are accepted only at 100 ml.
 * Soft UI defaults are not enough — sale validation must enforce this.
 */
export const REFILL_CUSTOMER_BOTTLE_ML = 100;

/** Backend-owned refill service rate (OMR per ml). */
export const REFILL_OMR_PER_ML = 1.2;

/** BLD-09 refill accessories the customer is charged for (bottle is customer-supplied). */
export const REFILL_CHARGEABLE_PACKAGING_ROLES = [
  "atomizer",
  "collar",
  "cap",
  "pouch",
] as const;

const ROLE_PATTERNS: Record<RemixRequiredRole, RegExp[]> = {
  bottle: [/\bbottle\b/i, /^BOT-/i],
  cap: [/\bcap\b/i, /^CAP-/i],
  atomizer: [/\batomizer\b/i, /^ATM-/i],
  collar: [/\bcollar\b/i, /^COL-/i],
  label: [/\blabel\b/i, /^LBL-/i],
  box: [/\bbox\b/i, /^BOX-/i, /^GB-/i],
  ethanol: [/\bethanol\b/i, /^ETH-/i],
  fixative: [/\bfixative\b/i, /^FIX-/i],
};

export function matchRemixRole(
  productName: string,
  sku?: string,
): RemixRequiredRole | null {
  const haystacks = [productName, sku ?? ""].filter(Boolean);
  for (const role of REMIX_REQUIRED_ROLES) {
    if (
      ROLE_PATTERNS[role].some((re) => haystacks.some((h) => re.test(h)))
    ) {
      return role;
    }
  }
  return null;
}

export function roleLabel(role: RemixRequiredRole): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}
