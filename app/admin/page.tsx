"use client";

import { useEffect, useState } from "react";

type Product = {
  id: number;
  name: string;
  searchTerm: string;
  mustInclude: string[];
  mustExclude: string[];
  upc: string | null;
  priceMin: number | null;
  priceMax: number | null;
  checkIntervalHours: number;
  alertWindowDays: number;
  alertMarginPct: number;
  alertCooldownHours: number;
  active: boolean;
  lastCheckedAt: string | null;
  confirmed: boolean;
};

type Offer = {
  seller: string;
  link: string;
  listedPrice: number;
  shipping: number;
  inStock: boolean;
  upc?: string;
};

type PendingMatch = {
  id: number;
  productId: number;
  canonicalTitle: string;
  canonicalUpc: string | null;
  imageUrl: string | null;
  offers: Offer[];
  resolved: boolean;
};

type MatchIssue = {
  id: number;
  productId: number;
  productName: string;
  reason: string;
  createdAt: string;
};

const emptyForm = {
  name: "",
  searchTerm: "",
  mustInclude: "",
  mustExclude: "",
  upc: "",
  priceMin: "",
  priceMax: "",
  checkIntervalHours: "6",
  alertWindowDays: "90",
  alertMarginPct: "3",
  alertCooldownHours: "24",
};

export default function AdminPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [pendingMatches, setPendingMatches] = useState<PendingMatch[]>([]);
  const [matchIssues, setMatchIssues] = useState<MatchIssue[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    const [productsRes, pendingRes, issuesRes] = await Promise.all([
      fetch("/api/admin/products").then((r) => r.json()),
      fetch("/api/admin/confirm").then((r) => r.json()),
      fetch("/api/admin/match-issues").then((r) => r.json()),
    ]);
    setProducts(productsRes);
    setPendingMatches(pendingRes);
    setMatchIssues(issuesRes);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function addProduct(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          searchTerm: form.searchTerm,
          mustInclude: form.mustInclude.split(",").map((s) => s.trim()).filter(Boolean),
          mustExclude: form.mustExclude.split(",").map((s) => s.trim()).filter(Boolean),
          upc: form.upc || undefined,
          priceMin: form.priceMin ? Number(form.priceMin) : undefined,
          priceMax: form.priceMax ? Number(form.priceMax) : undefined,
          checkIntervalHours: Number(form.checkIntervalHours),
          alertWindowDays: Number(form.alertWindowDays),
          alertMarginPct: Number(form.alertMarginPct),
          alertCooldownHours: Number(form.alertCooldownHours),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(data.error));
      setMessage(data.message ?? "Product added. Review the pending match below to confirm it.");
      setForm(emptyForm);
      await refresh();
    } catch (err) {
      setMessage(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function confirmMatch(pendingMatchId: number) {
    setBusy(true);
    try {
      await fetch("/api/admin/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingMatchId }),
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function deleteProduct(id: number) {
    setBusy(true);
    try {
      await fetch("/api/admin/products", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function runCheckNow() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/run-check", { method: "POST" });
      const data = await res.json();
      setMessage(
        `Run complete: ${data.alertItems.length} alert(s), ${data.matchIssueItems.length} match issue(s).`
      );
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-8 space-y-10">
      <h1 className="text-2xl font-bold">Price Tracker Admin</h1>

      {message && <div className="p-3 rounded bg-blue-50 text-blue-900 text-sm">{message}</div>}

      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">Add a product</h2>
          <button
            onClick={runCheckNow}
            disabled={busy}
            className="text-sm bg-black text-white px-3 py-1.5 rounded disabled:opacity-50"
          >
            Run check now
          </button>
        </div>
        <form onSubmit={addProduct} className="space-y-3 border rounded p-4">
          <Field label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
          <Field
            label="Search term"
            value={form.searchTerm}
            onChange={(v) => setForm({ ...form, searchTerm: v })}
            required
          />
          <Field
            label="Must-include keywords (comma separated)"
            value={form.mustInclude}
            onChange={(v) => setForm({ ...form, mustInclude: v })}
          />
          <Field
            label="Must-exclude keywords (comma separated)"
            value={form.mustExclude}
            onChange={(v) => setForm({ ...form, mustExclude: v })}
          />
          <Field label="UPC/GTIN/MPN (optional)" value={form.upc} onChange={(v) => setForm({ ...form, upc: v })} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Min price" value={form.priceMin} onChange={(v) => setForm({ ...form, priceMin: v })} />
            <Field label="Max price" value={form.priceMax} onChange={(v) => setForm({ ...form, priceMax: v })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Check interval (hours)"
              value={form.checkIntervalHours}
              onChange={(v) => setForm({ ...form, checkIntervalHours: v })}
            />
            <Field
              label="Alert window (days)"
              value={form.alertWindowDays}
              onChange={(v) => setForm({ ...form, alertWindowDays: v })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Alert margin (%)"
              value={form.alertMarginPct}
              onChange={(v) => setForm({ ...form, alertMarginPct: v })}
            />
            <Field
              label="Alert cooldown (hours)"
              value={form.alertCooldownHours}
              onChange={(v) => setForm({ ...form, alertCooldownHours: v })}
            />
          </div>
          <button disabled={busy} className="bg-black text-white px-4 py-2 rounded disabled:opacity-50">
            Add product
          </button>
        </form>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Pending matches — needs your confirmation</h2>
        {pendingMatches.length === 0 && <p className="text-sm text-zinc-500">None pending.</p>}
        <div className="space-y-4">
          {pendingMatches.map((pm) => {
            const product = products.find((p) => p.id === pm.productId);
            return (
              <div key={pm.id} className="border rounded p-4">
                <p className="font-medium">{product?.name ?? `Product #${pm.productId}`}</p>
                <p className="text-sm text-zinc-600">Canonical: {pm.canonicalTitle}</p>
                {pm.canonicalUpc && <p className="text-xs text-zinc-500">UPC: {pm.canonicalUpc}</p>}
                <ul className="mt-2 text-sm space-y-1">
                  {pm.offers.map((o, i) => (
                    <li key={i}>
                      {o.seller}: ${o.listedPrice.toFixed(2)} + ${o.shipping.toFixed(2)} shipping
                      {!o.inStock && " (out of stock)"} —{" "}
                      <a href={o.link} target="_blank" className="text-blue-600 underline">
                        link
                      </a>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => confirmMatch(pm.id)}
                  disabled={busy}
                  className="mt-3 bg-green-600 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50"
                >
                  Yes, that's the product — confirm and start tracking
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Tracked products</h2>
        <div className="space-y-2">
          {products.map((p) => (
            <div key={p.id} className="border rounded p-3 flex items-center justify-between">
              <div>
                <p className="font-medium">
                  {p.name} {p.confirmed ? "✅" : "⏳ awaiting confirmation"}
                </p>
                <p className="text-xs text-zinc-500">
                  {p.searchTerm} · every {p.checkIntervalHours}h · last checked:{" "}
                  {p.lastCheckedAt ? new Date(p.lastCheckedAt).toLocaleString() : "never"}
                </p>
              </div>
              <button onClick={() => deleteProduct(p.id)} disabled={busy} className="text-red-600 text-sm">
                Remove
              </button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Needs attention</h2>
        {matchIssues.length === 0 && <p className="text-sm text-zinc-500">No open issues.</p>}
        <ul className="text-sm space-y-1">
          {matchIssues.map((i) => (
            <li key={i.id}>
              <span className="font-medium">{i.productName}</span>: {i.reason}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="block mb-1 text-zinc-700">{label}</span>
      <input
        className="w-full border rounded px-2 py-1.5"
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
