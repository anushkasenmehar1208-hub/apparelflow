"use client";

import { useEffect, useState } from "react";
import {
  CountStatus,
  getApprovalBlockReason,
  getCountStatus,
  validateActualCount,
} from "@/lib/verification-rules";

type VerificationItem = {
  id: number;
  expectedQty: number;
  actualQty: number | null;
  status: CountStatus | null;
  component: { componentName: string; piecesPerGarment: number };
};

type VerificationOrder = {
  id: number;
  orderNo: string;
  targetQty: number;
  fabricRollId: string;
  actualFabricYds: string;
  status: "PENDING_VERIFICATION";
  createdAt: string;
  recipe: { recipeCode: string; name: string; stdFabricYards: string };
  creator: { fullName: string };
  verificationItems: VerificationItem[];
};

const statusStyles: Record<CountStatus, string> = {
  GREEN: "border-green-300 bg-green-50 text-green-900",
  YELLOW: "border-amber-300 bg-amber-50 text-amber-950",
  RED: "border-red-300 bg-red-50 text-red-900",
};

export function VerifierWorkspace() {
  const [orders, setOrders] = useState<VerificationOrder[]>([]);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function loadOrders() {
      try {
        const response = await fetch("/api/verification-orders", {
          cache: "no-store",
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error ?? "The verification queue could not be loaded.");
        }

        if (active) {
          setOrders(data.orders);
          setDrafts(
            Object.fromEntries(
              data.orders.flatMap((order: VerificationOrder) =>
                order.verificationItems.map((item) => [
                  item.id,
                  item.actualQty === null ? "" : String(item.actualQty),
                ]),
              ),
            ),
          );
        }
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "The verification queue could not be loaded.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadOrders();
    return () => {
      active = false;
    };
  }, []);

  async function saveCount(item: VerificationItem) {
    const validation = validateActualCount(drafts[item.id] ?? "");

    if (!validation.valid) {
      setFieldErrors((current) => ({
        ...current,
        [item.id]: validation.error,
      }));
      return;
    }

    setBusyKey(`item-${item.id}`);
    setError("");
    setMessage("");
    setFieldErrors((current) => ({ ...current, [item.id]: "" }));

    try {
      const response = await fetch(`/api/verification-items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actualQty: validation.value }),
      });
      const data = await response.json();

      if (!response.ok) {
        setFieldErrors((current) => ({
          ...current,
          [item.id]: data.errors?.actualQty ?? data.error,
        }));
        return;
      }

      setOrders((current) =>
        current.map((order) => ({
          ...order,
          verificationItems: order.verificationItems.map((currentItem) =>
            currentItem.id === item.id ? { ...currentItem, ...data.item } : currentItem,
          ),
        })),
      );
      setMessage("Component count saved.");
    } catch {
      setError("The count save result could not be confirmed. Refresh before retrying.");
    } finally {
      setBusyKey("");
    }
  }

  async function submitDecision(
    order: VerificationOrder,
    decision: "APPROVED" | "REJECTED",
  ) {
    const rejectionNote = notes[order.id]?.trim() ?? "";

    if (decision === "REJECTED" && !rejectionNote) {
      setFieldErrors((current) => ({
        ...current,
        [-order.id]: "Explain why this order is rejected.",
      }));
      return;
    }

    setBusyKey(`order-${order.id}`);
    setError("");
    setMessage("");
    setFieldErrors((current) => ({ ...current, [-order.id]: "" }));

    try {
      const response = await fetch(
        `/api/verification-orders/${order.id}/decision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision, rejectionNote }),
        },
      );
      const data = await response.json();

      if (!response.ok) {
        if (decision === "REJECTED" && data.errors?.rejectionNote) {
          setFieldErrors((current) => ({
            ...current,
            [-order.id]: data.errors.rejectionNote,
          }));
        } else {
          setError(data.error ?? "The verification decision could not be saved.");
        }
        return;
      }

      setOrders((current) => current.filter((entry) => entry.id !== order.id));
      setMessage(
        `${order.orderNo} was ${decision === "APPROVED" ? "approved" : "rejected"}.`,
      );
    } catch {
      setError("The decision result could not be confirmed. Refresh before retrying.");
    } finally {
      setBusyKey("");
    }
  }

  if (loading) {
    return (
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-semibold">Cutting Verification Queue</h2>
        <p className="mt-3 text-zinc-600">Loading pending orders…</p>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-semibold">Cutting Verification Queue</h2>
        <p className="mt-2 text-sm text-zinc-600">
          Record every component count, then approve or reject the order.
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-900">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="rounded-lg border border-green-300 bg-green-50 p-4 text-green-900">
          {message}
        </p>
      )}

      {orders.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-zinc-600 shadow-sm">
          No cutting orders are waiting for verification.
        </div>
      ) : (
        orders.map((order) => {
          const approvalBlock = getApprovalBlockReason(order.verificationItems);
          const orderBusy = busyKey === `order-${order.id}`;

          return (
            <article key={order.id} className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">
                    {order.orderNo}
                  </p>
                  <h3 className="mt-1 text-xl font-semibold">
                    {order.recipe.recipeCode} — {order.recipe.name}
                  </h3>
                </div>
                <span className="w-fit rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-950">
                  Pending verification
                </span>
              </div>

              <dl className="mt-5 grid gap-3 rounded-xl bg-zinc-50 p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <div><dt className="text-zinc-500">Target quantity</dt><dd className="font-semibold">{order.targetQty}</dd></div>
                <div><dt className="text-zinc-500">Fabric roll</dt><dd className="font-semibold">{order.fabricRollId}</dd></div>
                <div><dt className="text-zinc-500">Actual fabric</dt><dd className="font-semibold">{order.actualFabricYds} yd</dd></div>
                <div><dt className="text-zinc-500">Standard per garment</dt><dd className="font-semibold">{order.recipe.stdFabricYards} yd</dd></div>
                <div><dt className="text-zinc-500">Created by</dt><dd className="font-semibold">{order.creator.fullName}</dd></div>
                <div><dt className="text-zinc-500">Created</dt><dd className="font-semibold">{new Date(order.createdAt).toLocaleString()}</dd></div>
              </dl>

              <div className="mt-6 space-y-3">
                <h4 className="font-semibold">Component counts</h4>
                {order.verificationItems.map((item) => {
                  const validation = validateActualCount(drafts[item.id] ?? "");
                  const previewStatus = !validation.valid
                    ? item.status
                    : getCountStatus(item.expectedQty, validation.value);

                  return (
                    <div key={item.id} className="grid gap-3 rounded-xl border border-zinc-200 p-4 md:grid-cols-[1fr_140px_130px_auto] md:items-end">
                      <div>
                        <p className="font-medium">{item.component.componentName}</p>
                        <p className="mt-1 text-sm text-zinc-600">
                          {item.component.piecesPerGarment} × {order.targetQty} = <strong>{item.expectedQty} expected</strong>
                        </p>
                      </div>
                      <div>
                        <label htmlFor={`actual-${item.id}`} className="mb-1 block text-sm font-medium">Actual count</label>
                        <input
                          id={`actual-${item.id}`}
                          inputMode="numeric"
                          value={drafts[item.id] ?? ""}
                          disabled={!!busyKey}
                          aria-invalid={!!fieldErrors[item.id]}
                          aria-describedby={`actual-${item.id}-error`}
                          onChange={(event) => {
                            setDrafts((current) => ({ ...current, [item.id]: event.target.value }));
                            setFieldErrors((current) => ({ ...current, [item.id]: "" }));
                          }}
                          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-700"
                        />
                      </div>
                      <div>
                        <p className="mb-1 text-sm font-medium">Count status</p>
                        {previewStatus ? (
                          <span className={`inline-block rounded-lg border px-3 py-2 text-sm font-bold ${statusStyles[previewStatus]}`}>
                            {previewStatus}
                          </span>
                        ) : (
                          <span className="text-sm text-zinc-500">Not counted</span>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={!!busyKey}
                        onClick={() => void saveCount(item)}
                        className="rounded-lg bg-zinc-800 px-4 py-2 font-semibold text-white hover:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-800 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-zinc-600 disabled:text-white"
                      >
                        {busyKey === `item-${item.id}` ? "Saving…" : "Save count"}
                      </button>
                      {fieldErrors[item.id] && (
                        <p id={`actual-${item.id}-error`} className="text-sm font-medium text-red-800 md:col-span-4">
                          {fieldErrors[item.id]}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 border-t border-zinc-200 pt-6">
                {approvalBlock && <p className="mb-3 text-sm font-medium text-amber-900">Approval blocked: {approvalBlock}</p>}
                <label htmlFor={`note-${order.id}`} className="mb-2 block text-sm font-medium">
                  Rejection note
                </label>
                <textarea
                  id={`note-${order.id}`}
                  rows={3}
                  value={notes[order.id] ?? ""}
                  disabled={!!busyKey}
                  aria-invalid={!!fieldErrors[-order.id]}
                  aria-describedby={`note-${order.id}-error`}
                  onChange={(event) => {
                    setNotes((current) => ({ ...current, [order.id]: event.target.value }));
                    setFieldErrors((current) => ({ ...current, [-order.id]: "" }));
                  }}
                  placeholder="Required only when rejecting"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 placeholder:text-zinc-500 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-700"
                />
                {fieldErrors[-order.id] && (
                  <p id={`note-${order.id}-error`} className="mt-2 text-sm font-medium text-red-800">
                    {fieldErrors[-order.id]}
                  </p>
                )}
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={!!approvalBlock || !!busyKey}
                    onClick={() => void submitDecision(order, "APPROVED")}
                    className="rounded-lg bg-green-700 px-5 py-3 font-semibold text-white hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-green-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:border disabled:border-zinc-400 disabled:bg-zinc-200 disabled:text-zinc-700"
                  >
                    {orderBusy ? "Saving…" : "Approve order"}
                  </button>
                  <button
                    type="button"
                    disabled={!!busyKey}
                    onClick={() => void submitDecision(order, "REJECTED")}
                    className="rounded-lg bg-red-700 px-5 py-3 font-semibold text-white hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-zinc-600 disabled:text-white"
                  >
                    {orderBusy ? "Saving…" : "Reject order"}
                  </button>
                </div>
              </div>
            </article>
          );
        })
      )}
    </section>
  );
}
