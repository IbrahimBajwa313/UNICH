/** Required remix BOM roles (oil is customer-selected separately via oil-base). */
export const REMIX_REQUIRED_ROLES = [
  "bottle",
  "cap",
  "atomizer",
  "collar",
  "ethanol",
  "fixative",
] as const;

export type RemixRequiredRole = (typeof REMIX_REQUIRED_ROLES)[number];

export const OIL_BASE_PRODUCT_ID = "oil-base";

const ROLE_PATTERNS: Record<RemixRequiredRole, RegExp[]> = {
  bottle: [/\bbottle\b/i, /^BOT-/i],
  cap: [/\bcap\b/i, /^CAP-/i],
  atomizer: [/\batomizer\b/i, /^ATM-/i],
  collar: [/\bcollar\b/i, /^COL-/i],
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
