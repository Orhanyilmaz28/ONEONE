const PFAND = 0.25;          // € pro Dose
const FREE_SHIPPING = 30;    // € Warenwert
const SHIPPING = 4.9;        // €
const MIN_CANS = 6;          // Mindestbestellmenge

const PRODUCTS = [
  { id: "original",   name: "Original",    tag: "zucker", color: "#ff2e93", price: 1.49, desc: "Der Klassiker. Süß, spritzig, kräftig." },
  { id: "tropical",   name: "Tropical",    tag: "zucker", color: "#ff9f1c", price: 1.49, desc: "Mango, Ananas und Maracuja." },
  { id: "berry",      name: "Berry Blast", tag: "zucker", color: "#7c3aed", price: 1.59, desc: "Waldbeeren mit fruchtiger Säure." },
  { id: "watermelon", name: "Watermelon",  tag: "zucker", color: "#ef476f", price: 1.59, desc: "Sommer in der Dose." },
  { id: "lime",       name: "Lime Storm",  tag: "zero",   color: "#2ec27e", price: 1.59, desc: "Zero Sugar. Frische Limette, kein Zucker." },
  { id: "zero",       name: "Zero Sugar",  tag: "zero",   color: "#3a86ff", price: 1.49, desc: "Voller Geschmack, null Zucker." },
];

const $ = (s) => document.querySelector(s);
const eur = (n) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });

let cart = {};
try { cart = JSON.parse(localStorage.getItem("exstase-cart")) || {}; } catch { cart = {}; }
const save = () => { try { localStorage.setItem("exstase-cart", JSON.stringify(cart)); } catch {} };

function renderProducts(filter = "all") {
  $("#productGrid").innerHTML = PRODUCTS
    .filter((p) => filter === "all" || p.tag === filter)
    .map((p) => `
      <article class="card" style="--c:${p.color}">
        <div class="can-wrap"><div class="can">EX<br>STASE<br>${p.name.toUpperCase()}</div></div>
        <span class="badge">${p.tag === "zero" ? "Zero Sugar" : "Original Zucker"}</span>
        <h3>${p.name}</h3>
        <p>${p.desc}</p>
        <div class="price-row">
          <span class="price">${eur(p.price)}</span>
          <button class="btn" data-add="${p.id}">+ 6er Pack</button>
        </div>
      </article>`).join("");
}

function totals() {
  const items = Object.entries(cart).map(([id, qty]) => ({ p: PRODUCTS.find((x) => x.id === id), qty }));
  const cans = items.reduce((s, i) => s + i.qty, 0);
  const goods = items.reduce((s, i) => s + i.qty * i.p.price, 0);
  const pfand = cans * PFAND;
  const shipping = cans === 0 || goods >= FREE_SHIPPING ? 0 : SHIPPING;
  return { items, cans, goods, pfand, shipping, total: goods + pfand + shipping };
}

function renderCart() {
  const t = totals();
  $("#cartCount").textContent = t.cans;
  $("#cartItems").innerHTML = t.items.length
    ? t.items.map(({ p, qty }) => `
        <div class="line" style="--c:${p.color}">
          <span class="dot"></span>
          <div>${p.name}<small>${eur(p.price)} / Dose</small></div>
          <div class="qty">
            <button data-dec="${p.id}" aria-label="weniger">−</button>
            <span>${qty}</span>
            <button data-inc="${p.id}" aria-label="mehr">+</button>
          </div>
        </div>`).join("")
    : `<p class="empty">Dein Warenkorb ist leer.</p>`;

  const row = (l, v, c = "") => `<div class="${c}"><dt>${l}</dt><dd style="margin:0">${v}</dd></div>`;
  $("#totals").innerHTML =
    row("Waren", eur(t.goods)) +
    row("Pfand", eur(t.pfand)) +
    row("Versand", t.shipping ? eur(t.shipping) : "kostenlos") +
    row("Gesamt", eur(t.total), "total") +
    (t.cans > 0 && t.cans < MIN_CANS ? `<p class="warn">Mindestbestellung: ${MIN_CANS} Dosen.</p>` : "");
  $("#checkoutBtn").disabled = t.cans < MIN_CANS;
}

function change(id, delta) {
  cart[id] = (cart[id] || 0) + delta;
  if (cart[id] <= 0) delete cart[id];
  save(); renderCart();
}

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg; el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2200);
}

function drawer(open) {
  $("#drawer").classList.toggle("open", open);
  $("#drawer").setAttribute("aria-hidden", String(!open));
  $("#overlay").hidden = !open;
}

document.addEventListener("click", (e) => {
  const add = e.target.closest("[data-add]");
  if (add) { change(add.dataset.add, 6); toast("6 Dosen im Warenkorb"); return; }
  const inc = e.target.closest("[data-inc]");
  if (inc) return change(inc.dataset.inc, 1);
  const dec = e.target.closest("[data-dec]");
  if (dec) return change(dec.dataset.dec, -1);
  const chip = e.target.closest(".chip");
  if (chip) {
    document.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === chip));
    renderProducts(chip.dataset.filter);
  }
});

$("#openCart").onclick = () => drawer(true);
$("#closeCart").onclick = () => drawer(false);
$("#overlay").onclick = () => drawer(false);
$("#checkoutBtn").onclick = () => { drawer(false); $("#checkout").showModal(); };
$("#cancelCheckout").onclick = () => $("#checkout").close();

$("#checkoutForm").addEventListener("submit", (e) => {
  e.preventDefault();
  if (!e.target.reportValidity()) return;
  // Demo: hier später Backend / Zahlungsanbieter (Stripe, PayPal, …) anbinden.
  const order = { ...Object.fromEntries(new FormData(e.target)), ...totals(), at: new Date().toISOString() };
  console.log("Bestellung (Demo):", order);
  cart = {}; save(); renderCart();
  $("#checkout").close();
  toast("Danke für deine Bestellung! (Demo)");
});

$("#year").textContent = new Date().getFullYear();
renderProducts();
renderCart();
