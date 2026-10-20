/**
 * Hilfsprozess für den Mehrprozess-Test (tests/store-redis.test.mts): simuliert eine weitere Server-Instanz,
 * die gleichzeitig dieselben Datensätze ändert. Nur gegen die isolierte Testdatenbank verwenden.
 * Aufruf: tsx tests/helpers/store-worker.mts <worker-nr> <anzahl>
 */
const worker = Number(process.argv[2]);
const count = Number(process.argv[3]);

const { updateJSON } = await import("../../lib/store");
const { recordCommission } = await import("../../lib/commissions");
const { createDealerOrder } = await import("../../lib/dealer-orders");

const jobs: Promise<unknown>[] = [];
for (let i = 0; i < count; i++) {
  // gleicher Datensatz (Zähler) …
  jobs.push(updateJSON<{ n: number }>("tt:test:mp-counter", { n: 0 }, (c) => ({ n: c.n + 1 })));
  // … und unterschiedliche Datensätze im selben JSON-Block
  jobs.push(updateJSON<Record<string, number>>("tt:test:mp-records", {}, (all) => ({ ...all, [`w${worker}-${i}`]: i })));
}
// Dieselben Provisionsereignisse aus allen Prozessen gleichzeitig (Webhook + Erfolgsseite auf verschiedenen Instanzen)
for (let i = 0; i < 5; i++) {
  jobs.push(
    recordCommission({
      id: `cs_test_mp_${i}`,
      created: Math.floor(Date.UTC(2026, 8, 10) / 1000),
      payment_status: "paid",
      metadata: { refId: process.env.MP_INFLUENCER ?? "", goodsNet: "10000", commissionPct: "10", ref: "MP" },
    } as never),
  );
}
// Händlerbestellungen aus mehreren Instanzen → Nummern müssen eindeutig bleiben
for (let i = 0; i < 3; i++) {
  jobs.push(createDealerOrder({ dealerId: `dealer-w${worker}`, dealerEmail: "test@example.invalid", tierName: "Standard", calc: {}, delivery: {} } as never));
}
await Promise.all(jobs);
process.exit(0);
