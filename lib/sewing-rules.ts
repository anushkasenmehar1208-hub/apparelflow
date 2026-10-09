export type SewingOrderStatus =
  | "CUTTING_IN_PROGRESS"
  | "PENDING_VERIFICATION"
  | "REJECTED"
  | "VERIFIED"
  | "SEWING_STARTED";

export function canStartSewing(status: SewingOrderStatus) {
  return status === "VERIFIED";
}
