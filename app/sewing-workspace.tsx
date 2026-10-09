"use client";

import { useEffect, useState } from "react";

type ComponentStatus = "GREEN" | "YELLOW" | "RED";

type SewingOrder = {
  id: number;
  orderNo: string;
  targetQty: number;
  fabricRollId: string;
  actualFabricYds: string;
  status: "VERIFIED";
  recipe: { recipeCode: string; name: string };
  verificationItems: Array<{
    id: number;
    expectedQty: number;
    actualQty: number | null;
    status: ComponentStatus | null;
    component: { componentName: string };
  }>;
  verification: {
    decision: "APPROVED";
    rejectionNote: string | null;
    wastagePct: string;
    timestamp: string;
    verifier: { fullName: string };
  } | null;
};

const statusStyles: Record<ComponentStatus, string> = {
  GREEN: "border-green-300 bg-green-50 text-green-900",
  YELLOW: "border-amber-300 bg-amber-50 text-amber-950",
  RED: "border-red-300 bg-red-50 text-red-900",
};

export function SewingWorkspace() {
  const [orders, setOrders] = useState<SewingOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [startingId, setStartingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function loadQueue() {
      try {
        const response = await fetch("/api/sewing-orders", { cache: "no-store" });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error ?? "The sewing queue could not be loaded.");
        }

        if (active) setOrders(data.orders);
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "The sewing queue could not be loaded.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadQueue();
    return () => {
      active = false;
    };
  }, []);

  async function startAssembly(order: SewingOrder) {
    if (startingId !== null) return;
    setStartingId(order.id);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/sewing-orders/${order.id}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Sewing assembly could not be started.");
        return;
      }

      setOrders((current) => current.filter((entry) => entry.id !== order.id));
      setMessage(`${order.orderNo} moved to sewing assembly.`);
    } catch {
      setError("The start result could not be confirmed. Refresh before retrying.");
    } finally {
      setStartingId(null);
    }
  }

  if (loading) {
    return (
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-semibold">Sewing Queue</h2>
        <p className="mt-3 text-zinc-600">Loading verified orders…</p>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-semibold">Sewing Queue</h2>
        <p className="mt-2 text-sm text-zinc-600">
          Only verified batches ready to start sewing are shown. Started batches leave this queue.
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
          No verified cutting orders are ready to start sewing.
        </div>
      ) : (
        orders.map((order) => (
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
              <span className="w-fit rounded-full border border-green-300 bg-green-50 px-3 py-1 text-sm font-bold text-green-900">
                VERIFIED
              </span>
            </div>

            <dl className="mt-5 grid gap-3 rounded-xl bg-zinc-50 p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div><dt className="text-zinc-600">Target quantity</dt><dd className="font-semibold">{order.targetQty}</dd></div>
              <div><dt className="text-zinc-600">Fabric roll</dt><dd className="font-semibold">{order.fabricRollId}</dd></div>
              <div><dt className="text-zinc-600">Actual fabric</dt><dd className="font-semibold">{order.actualFabricYds} yd</dd></div>
              <div><dt className="text-zinc-600">Verifier</dt><dd className="font-semibold">{order.verification?.verifier.fullName ?? "Audit record unavailable"}</dd></div>
              <div><dt className="text-zinc-600">Verified at</dt><dd className="font-semibold">{order.verification ? new Date(order.verification.timestamp).toLocaleString() : "Audit record unavailable"}</dd></div>
              <div><dt className="text-zinc-600">Wastage</dt><dd className="font-semibold">{order.verification ? `${order.verification.wastagePct}%` : "Audit record unavailable"}</dd></div>
              <div className="sm:col-span-2 lg:col-span-3"><dt className="text-zinc-600">Rejection note</dt><dd className="font-semibold">{order.verification?.rejectionNote ?? "None — approved batch"}</dd></div>
            </dl>

            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-left text-sm">
                <caption className="mb-3 text-left font-semibold">Verified component counts</caption>
                <thead>
                  <tr className="border-b border-zinc-300 text-zinc-700">
                    <th scope="col" className="px-3 py-2">Component</th>
                    <th scope="col" className="px-3 py-2">Expected</th>
                    <th scope="col" className="px-3 py-2">Actual</th>
                    <th scope="col" className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {order.verificationItems.map((item) => (
                    <tr key={item.id} className="border-b border-zinc-200">
                      <th scope="row" className="px-3 py-3 font-medium">{item.component.componentName}</th>
                      <td className="px-3 py-3">{item.expectedQty}</td>
                      <td className="px-3 py-3">{item.actualQty ?? "Not counted"}</td>
                      <td className="px-3 py-3">
                        {item.status ? (
                          <span className={`inline-block rounded-lg border px-3 py-1 font-bold ${statusStyles[item.status]}`}>
                            {item.status}
                          </span>
                        ) : (
                          <span className="font-medium text-zinc-700">Not counted</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              type="button"
              disabled={startingId !== null}
              onClick={() => void startAssembly(order)}
              className="mt-6 rounded-lg bg-teal-700 px-5 py-3 font-semibold text-white transition hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-zinc-600 disabled:text-white"
            >
              {startingId === order.id ? "Starting…" : "Start Sewing Assembly"}
            </button>
          </article>
        ))
      )}
    </section>
  );
}
