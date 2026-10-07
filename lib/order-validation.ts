export type OrderFields = { recipeId: string; targetQty: string; fabricRollId: string; actualFabricYards: string };
export type FieldErrors = Partial<Record<keyof OrderFields, string>>;
export const MAX_INT = 2147483647;

export function validateOrder(input: unknown) {
  const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const fields = Object.fromEntries(["recipeId", "targetQty", "fabricRollId", "actualFabricYards"].map(key =>
    [key, typeof source[key] === "string" ? source[key].trim() : key !== "fabricRollId" && typeof source[key] === "number" && Number.isFinite(source[key]) ? String(source[key]) : ""])) as OrderFields;
  const errors: FieldErrors = {};
  for (const key of ["recipeId", "targetQty"] as const) {
    if (!fields[key]) errors[key] = key === "recipeId" ? "Please select a recipe." : "Target quantity is required.";
    else if (!/^\d+$/.test(fields[key]) || !Number.isSafeInteger(Number(fields[key])) || Number(fields[key]) <= 0 || Number(fields[key]) > MAX_INT)
      errors[key] = key === "recipeId" ? "Select a valid recipe." : "Target quantity must be a positive whole number within the supported range.";
  }
  if (!fields.fabricRollId) errors.fabricRollId = "Fabric Roll ID is required.";
  else if (fields.fabricRollId.length > 100) errors.fabricRollId = "Fabric Roll ID must be at most 100 characters.";
  if (!fields.actualFabricYards) errors.actualFabricYards = "Actual fabric used is required.";
  else if (!/^\d+(\.\d{1,2})?$/.test(fields.actualFabricYards) || Number(fields.actualFabricYards) <= 0 || Number(fields.actualFabricYards) > 99999999.99)
    errors.actualFabricYards = "Enter positive fabric yards, up to 99,999,999.99, with at most two decimal places.";
  return { fields, errors, valid: Object.keys(errors).length === 0 };
}
