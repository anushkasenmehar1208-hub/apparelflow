"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { FieldErrors, MAX_INT, validateOrder } from "@/lib/order-validation";

type Role = "CUTTING_SUPERVISOR" | "CUTTING_VERIFIER" | "SEWING_SUPERVISOR";
type Recipe = { id: number; recipeCode: string; name: string; components: { id: number; componentName: string; piecesPerGarment: number }[] };
const roles: { value: Role; label: string }[] = [
  { value: "CUTTING_SUPERVISOR", label: "Cutting Supervisor" },
  { value: "CUTTING_VERIFIER", label: "Cutting Verifier" },
  { value: "SEWING_SUPERVISOR", label: "Sewing Supervisor" },
];

export default function Home() {
  const [currentRole, setCurrentRole] = useState<Role | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [recipeId, setRecipeId] = useState("");
  const [targetQty, setTargetQty] = useState("");
  const [fabricRollId, setFabricRollId] = useState("");
  const [actualFabricYards, setActualFabricYards] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [recipeResponse, sessionResponse] = await Promise.all([fetch("/api/recipes"), fetch("/api/demo-session")]);
        const [recipeData, sessionData] = await Promise.all([recipeResponse.json(), sessionResponse.json()]);
        if (!recipeResponse.ok || !sessionResponse.ok) throw new Error("Recipes or demo session could not be loaded. Please reload to retry.");
        if (active) { setRecipes(recipeData.recipes); setCurrentRole(sessionData.user?.role ?? null); }
      } catch { if (active) setError("Recipes or demo session could not be loaded. Please reload to retry."); }
      finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, []);

  const selectedRecipe = recipes.find(recipe => recipe.id === Number(recipeId));
  const quantity = Number(targetQty);
  const hasValidQuantity = /^\d+$/.test(targetQty) && Number.isSafeInteger(quantity) && quantity > 0 && quantity <= MAX_INT;
  const expectedComponents = useMemo(() => {
    if (!selectedRecipe || !hasValidQuantity) return [];
    return selectedRecipe.components.map(component => ({ ...component, expectedQty: component.piecesPerGarment * quantity }));
  }, [selectedRecipe, hasValidQuantity, quantity]);

  async function switchRole(role: Role) {
    setPending(true); setError(""); setMessage(""); setErrors({});
    try {
      const response = await fetch("/api/demo-session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }) });
      const data = await response.json();
      if (!response.ok) { setError(data.error); return; }
      setCurrentRole(data.user.role);
    } catch { setError("Role could not be switched. Please retry."); }
    finally { setPending(false); }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(""); setMessage("");
    const result = validateOrder({ recipeId, targetQty, fabricRollId, actualFabricYards });
    if (!selectedRecipe) result.errors.recipeId = "Please select an available recipe.";
    if (expectedComponents.some(component => component.expectedQty > MAX_INT)) result.errors.targetQty = "Component quantity exceeds the supported range. Reduce the batch size.";
    setErrors(result.errors);
    if (Object.keys(result.errors).length) return;
    if (currentRole !== "CUTTING_SUPERVISOR") { setError("Only the Cutting Supervisor can create a cutting order."); return; }
    setPending(true);
    try {
      const response = await fetch("/api/cutting-orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(result.fields) });
      const data = await response.json();
      if (!response.ok) { setErrors(data.errors ?? {}); setError(data.error); return; }
      setMessage(`Order ${data.order.orderNo} saved — pending verification.`);
      setTargetQty(""); setFabricRollId(""); setActualFabricYards("");
    } catch { setError("The save result could not be confirmed. Check before resubmitting to avoid duplicates."); }
    finally { setPending(false); }
  }

  function fieldError(field: keyof FieldErrors) {
    return errors[field] ? <p id={`${field}-error`} className="mt-2 text-sm font-medium text-red-800">{errors[field]}</p> : null;
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-10 text-zinc-900">
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <header className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-widest text-teal-700">
            Garment production ERP
          </p>

          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            ApparelFlow
          </h1>

          <p className="mt-3 text-zinc-600">
            Day 2: role switching and cutting order creation.
          </p>
        </header>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">
            Demo Role Switcher
          </h2>

          <p className="mt-2 text-sm text-zinc-600">
            Choose a demo identity. This is an open internship demo, not a real login system.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {roles.map((role) => (
              <button
                key={role.value}
                type="button"
                onClick={() => void switchRole(role.value)}
                disabled={pending || loading}
                aria-pressed={currentRole === role.value}
                className={`rounded-xl border px-4 py-3 text-left font-medium transition ${
                  currentRole === role.value
                    ? "border-teal-700 bg-teal-50 text-teal-900"
                    : "border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50"
                }`}
              >
                {role.label}
              </button>
            ))}
          </div>

          <p className="mt-4 text-sm text-zinc-600">
            Current role:{" "}
            <strong>{loading ? "Loading…" : currentRole ?? "Select a demo role"}</strong>
          </p>
        </section>

        {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-900">{error}</p>}
        {currentRole === "CUTTING_SUPERVISOR" ? (
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-semibold">
              Create Cutting Order
            </h2>

            <p className="mt-2 text-sm text-zinc-600">
              Enter the production batch details.
            </p>

            <form
              onSubmit={handleSubmit}
              noValidate
              className="mt-6 space-y-5"
            >
              <div>
                <label
                  htmlFor="recipe"
                  className="mb-2 block text-sm font-medium"
                >
                  Recipe
                </label>

                <select
                  id="recipe"
                  aria-invalid={!!errors.recipeId}
                  aria-describedby="recipeId-error"
                  disabled={pending}
                  value={recipeId}
                  onChange={(event) =>
                    setRecipeId(event.target.value)
                  }
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
                >
                  <option value="">Select a recipe</option>
                  {recipes.map((recipe) => (
                    <option
                      key={recipe.id}
                      value={recipe.id}
                    >
                      {recipe.recipeCode} - {recipe.name}
                    </option>
                  ))}
                </select>
                {fieldError("recipeId")}
              </div>

              <div>
                <label
                  htmlFor="targetQty"
                  className="mb-2 block text-sm font-medium"
                >
                  Target Batch Quantity
                </label>

                <input
                  id="targetQty"
                  aria-invalid={!!errors.targetQty}
                  aria-describedby="targetQty-error"
                  disabled={pending}
                  type="number"
                  min="1"
                  step="1"
                  value={targetQty}
                  onChange={(event) =>
                    setTargetQty(event.target.value)
                  }
                  placeholder="Example: 50"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 placeholder:text-zinc-500 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
                />
                {fieldError("targetQty")}
              </div>

              <div>
                <label
                  htmlFor="fabricRollId"
                  className="mb-2 block text-sm font-medium"
                >
                  Fabric Roll ID
                </label>

                <input
                  id="fabricRollId"
                  aria-invalid={!!errors.fabricRollId}
                  aria-describedby="fabricRollId-error"
                  disabled={pending}
                  type="text"
                  value={fabricRollId}
                  onChange={(event) =>
                    setFabricRollId(event.target.value)
                  }
                  placeholder="Example: FAB-ROLL-882"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 placeholder:text-zinc-500 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
                />
                {fieldError("fabricRollId")}
              </div>

              <div>
                <label
                  htmlFor="actualFabricYards"
                  className="mb-2 block text-sm font-medium"
                >
                  Actual Fabric Used (yards)
                </label>

                <input
                  id="actualFabricYards"
                  aria-invalid={!!errors.actualFabricYards}
                  aria-describedby="actualFabricYards-error"
                  disabled={pending}
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={actualFabricYards}
                  onChange={(event) =>
                    setActualFabricYards(
                      event.target.value
                    )
                  }
                  placeholder="Example: 92.5"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 placeholder:text-zinc-500 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
                />
                {fieldError("actualFabricYards")}
              </div>

              {selectedRecipe && (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5">
                  <h3 className="font-semibold">
                    Expected Components
                  </h3>

                  <p className="mt-1 text-sm text-zinc-600">
                    {selectedRecipe.name} ×{" "}
                    {hasValidQuantity
                      ? quantity
                      : 0}{" "}
                    garments
                  </p>

                  <div className="mt-4 space-y-2">
                    {expectedComponents.length > 0 ? (
                      expectedComponents.map(
                        (component) => (
                          <div
                            key={component.id}
                            className="flex items-center justify-between rounded-lg bg-white px-4 py-3 text-sm"
                          >
                            <span>
                              {component.componentName}
                            </span>

                            <span className="font-semibold">
                              {
                                component.piecesPerGarment
                              }{" "}
                              × {quantity} ={" "}
                              {
                                component.expectedQty
                              }
                            </span>
                          </div>
                        )
                      )
                    ) : (
                      <p className="text-sm text-zinc-500">
                        Enter a target quantity to calculate expected component counts.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {message && (
                <p role="status" className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                  {message}
                </p>
              )}

              <button
                type="submit"
                disabled={pending || loading || recipes.length === 0}
                className="rounded-lg bg-teal-700 px-5 py-3 font-semibold text-white transition hover:bg-teal-800"
              >
                {pending ? "Saving…" : "Create Cutting Order"}
              </button>
            </form>
          </section>
        ) : (
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">
              {!currentRole ? "Select a demo role" : currentRole ===
              "CUTTING_VERIFIER"
                ? "Cutting Verifier"
                : "Sewing Supervisor"}
            </h2>

            <p className="mt-2 text-zinc-600">
              {currentRole ? "This role cannot create cutting orders." : "Select a demo role above to begin."}
              Its workspace will be built later.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}