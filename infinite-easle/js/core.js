/* Shared store logic, used by both designs.
   Each design supplies window.UI with card(), hero() and (optionally) afterArt(). */
(function () {
  const C = window.STORE_CONFIG;
  const sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY);

  const CATS = [
    { id: "logos-branding", name: "Logos & Branding Art", short: "Logos & Branding",
      blurb: "Hand-painted logos, shop signs and brand pieces for offices, cafés and studios." },
    { id: "cartoon-anime", name: "Cartoon & Anime Characters", short: "Cartoon & Anime",
      blurb: "Your favourite characters on canvas, for bedrooms, gaming corners and gifts." },
    { id: "home-decor", name: "Home Decor & Wall Art", short: "Home Decor",
      blurb: "Landscapes, abstracts and statement pieces to finish a room." },
    { id: "movies-series-sitcoms", name: "Movies, Series & Sitcoms", short: "Movies & Series",
      blurb: "Scenes and characters from your favourite movies, series and sitcoms, painted on canvas." },
    { id: "customized-paintings", name: "Customized Paintings", short: "Custom Paintings",
      blurb: "Paintings made to order, painted just for you." },
  ];
  CATS.forEach((c) => (c.page = c.id + ".html"));
  const DELIVERY = {
    inside_dhaka: { label: "Inside Dhaka", fee: 100 },
    outside_dhaka: { label: "Outside Dhaka", fee: 150 },
  };
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const PHONE = /^(\+?88)?01[3-9]\d{8}$/;
  const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  const PLACEHOLDER = "data:image/svg+xml;utf8," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500"><rect width="400" height="500" fill="#E6E2DA"/><path d="M0 380 L120 260 L210 340 L290 250 L400 360 L400 500 L0 500Z" fill="#CFC8BC"/><circle cx="300" cy="140" r="44" fill="#D8D1C5"/></svg>');

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tk = (n) => "৳" + Math.round(Number(n) || 0).toLocaleString("en-IN");
  const cat = (id) => CATS.find((c) => c.id === id) || CATS[2];
  const imgOf = (p) => (p && p.image_url) || PLACEHOLDER;
  const artUrl = (p) => `art.html?id=${encodeURIComponent(p.id)}`;
  function stock(p) {
    const q = Number(p.quantity) || 0;
    if (q <= 0) return { key: "out", label: "Sold out" };
    if (q <= 3) return { key: "low", label: `Only ${q} left` };
    return { key: "in", label: `${q} in stock` };
  }
  function starsHTML(r) {
    const n = Math.round(Number(r) || 0);
    return `<span class="stars" aria-label="${n} out of 5 stars">${"★".repeat(n)}<span class="off">${"★".repeat(5 - n)}</span></span>`;
  }
  const remember = {
    get() { try { return JSON.parse(localStorage.getItem("rt.customer") || "{}"); } catch (_) { return {}; } },
    set(v) { try { localStorage.setItem("rt.customer", JSON.stringify(v)); } catch (_) {} },
  };

  // The order details are kept for the payment page only while the tab is open.
  const draft = {
    KEY: "ie.checkout",
    get() {
      try {
        const d = JSON.parse(sessionStorage.getItem(this.KEY) || "null");
        return d && UUID.test(d.pid) && DELIVERY[d.area] && ["bkash", "nagad"].includes(d.method) ? d : null;
      } catch (_) { return null; }
    },
    set(v) { try { sessionStorage.setItem(this.KEY, JSON.stringify(v)); return true; } catch (_) { return false; } },
    clear() { try { sessionStorage.removeItem(this.KEY); } catch (_) {} },
  };

  // ---------- Common page chrome ----------
  function chrome() {
    $$("[data-store-name]").forEach((el) => (el.textContent = C.STORE_NAME));
    $$("[data-tagline]").forEach((el) => (el.textContent = C.TAGLINE));
    $$("[data-contact-phone]").forEach((el) => { el.textContent = C.CONTACT_PHONE; if (el.tagName === "A") el.href = "tel:" + C.CONTACT_PHONE.replace(/[^\d+]/g, ""); });
    $$("[data-contact-email]").forEach((el) => { el.textContent = C.CONTACT_EMAIL; if (el.tagName === "A") el.href = "mailto:" + C.CONTACT_EMAIL; });
    $$("[data-year]").forEach((el) => (el.textContent = new Date().getFullYear()));
    // Facebook links: shown only when a real https link is set in js/config.js
    const fbUrl = (u) => (/^https?:\/\/\S+$/i.test(String(u || "").trim()) ? String(u).trim() : "");
    $$("[data-social]").forEach((a) => {
      const u = fbUrl(a.dataset.social === "owner" ? C.OWNER_FACEBOOK_URL : C.FACEBOOK_PAGE_URL);
      a.hidden = !u;
      if (u) { a.href = u; a.target = "_blank"; a.rel = "noopener noreferrer"; }
    });
    $$("[data-social-box]").forEach((b) => (b.hidden = !$$("[data-social]:not([hidden])", b).length));
    markNav(document.body.dataset.pageCat);
  }
  function markNav(id) {
    $$("[data-nav-cat]").forEach((a) => {
      if (a.dataset.navCat === id) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
  }

  // ---------- Home ----------
  const LIST_COLS = "id,title,artist,price,image_url,dimensions,medium,quantity,sold,category,featured,created_at";
  const countText = (n) => `${n} ${n === 1 ? "piece" : "pieces"}`;
  function loadFailed() {
    $$("[data-grid]").forEach((g) => (g.innerHTML = `<p class="state-msg">The artworks couldn't load. Check your connection and refresh the page.</p>`));
  }
  async function initHome() {
    chrome();
    const { data, error } = await sb.from("paintings").select(LIST_COLS).order("created_at", { ascending: false });
    if (error) return loadFailed();
    const list = data || [];
    CATS.forEach((c) => {
      const items = list.filter((p) => p.category === c.id);
      $$(`[data-count="${c.id}"]`).forEach((el) => (el.textContent = countText(items.length)));
      const pics = items.filter((p) => p.quantity > 0).concat(items.filter((p) => p.quantity <= 0)).slice(0, 3);
      $$(`[data-preview="${c.id}"]`).forEach((box) => {
        box.innerHTML = pics.length
          ? pics.map((p) => `<span class="mini"><img loading="lazy" src="${esc(imgOf(p))}" alt=""></span>`).join("")
          : `<span class="mini empty"></span>`;
      });
    });
    const fresh = list.filter((p) => p.quantity > 0).slice(0, 4);
    $$('[data-grid="new"]').forEach((g) => {
      g.innerHTML = fresh.length ? fresh.map(UI.card).join("") : `<p class="state-msg">New pieces are on the easel. Check back soon.</p>`;
    });
    const hero = list.find((p) => p.featured && p.quantity > 0) || list.find((p) => p.quantity > 0) || list[0];
    if (hero && UI.hero) UI.hero(hero);
  }

  // ---------- Collection page ----------
  async function initCategory() {
    chrome();
    const c = cat(document.body.dataset.pageCat);
    const { data, error } = await sb.from("paintings").select(LIST_COLS).eq("category", c.id).order("created_at", { ascending: false });
    if (error) return loadFailed();
    const all = data || [];
    $$(`[data-count="${c.id}"]`).forEach((el) => (el.textContent = countText(all.length)));
    const sort = $("#sort"), inStock = $("#instock");
    function render() {
      let items = all.slice();
      if (inStock && inStock.checked) items = items.filter((p) => p.quantity > 0);
      const by = sort ? sort.value : "new";
      if (by === "price-asc") items.sort((a, b) => a.price - b.price);
      else if (by === "price-desc") items.sort((a, b) => b.price - a.price);
      else if (by === "popular") items.sort((a, b) => (b.sold || 0) - (a.sold || 0));
      else items.sort((a, b) => (b.quantity > 0) - (a.quantity > 0) || (a.created_at < b.created_at ? 1 : -1));
      $$(`[data-grid="${c.id}"]`).forEach((g) => {
        g.innerHTML = items.length ? items.map(UI.card).join("")
          : all.length ? `<p class="state-msg">Everything in this collection is sold out right now. Untick "Hide sold out" to see past pieces.</p>`
          : `<p class="state-msg">New pieces for this collection are on the easel. Check back soon.</p>`;
      });
      $$("[data-showing]").forEach((el) => (el.textContent = items.length === all.length ? `Showing all ${countText(all.length)}` : `Showing ${items.length} of ${all.length}`));
    }
    if (sort) sort.addEventListener("change", render);
    if (inStock) inStock.addEventListener("change", render);
    render();
  }

  // ---------- Artwork page ----------
  let current = null;
  async function initArt() {
    chrome();
    const id = new URLSearchParams(location.search).get("id") || decodeURIComponent(location.hash.slice(1)) || "";
    if (!UUID.test(id)) return artState("missing");
    const [pr, rv] = await Promise.all([
      sb.from("paintings").select("*").eq("id", id).maybeSingle(),
      sb.from("reviews").select("id,reviewer_name,rating,comment,created_at").eq("painting_id", id).order("created_at", { ascending: false }),
    ]);
    if (pr.error) return artState("error");
    if (!pr.data) return artState("missing");
    current = pr.data;
    document.title = `${current.title} | ${C.STORE_NAME}`;
    fillArt(current);
    renderReviews(rv.data || []);
    setupOrder(current);
    setupReviewForm(current);
    artState("ready");
    if (UI.afterArt) UI.afterArt(current);
  }
  function artState(s) {
    const show = (id, on) => { const el = document.getElementById(id); if (el) el.hidden = !on; };
    show("art-loading", false);
    show("art-main", s === "ready");
    show("art-missing", s === "missing" || s === "error");
    if (s === "error") { const m = $("#art-missing [data-msg]"); if (m) m.textContent = "This page couldn't load. Check your connection and refresh."; }
  }
  function fillArt(p) {
    const c = cat(p.category), st = stock(p);
    const F = {
      title: p.title, artist: p.artist ? `by ${p.artist}` : "", category: c.name, "category-short": c.short,
      price: tk(p.price), size: p.dimensions, medium: p.medium, desc: p.description,
      stock: st.label, "stock-num": String(Math.max(0, p.quantity)), sold: String(p.sold || 0),
      "sold-label": `${p.sold || 0} sold`,
    };
    $$("[data-f]").forEach((el) => { const k = el.dataset.f; if (k in F) el.textContent = F[k] || el.dataset.empty || ""; });
    $$("[data-hide-empty]").forEach((el) => (el.hidden = !F[el.dataset.hideEmpty]));
    $$("[data-cat-link]").forEach((a) => (a.href = c.page));
    markNav(c.id);
    $$("[data-stock-state]").forEach((el) => (el.dataset.stockState = st.key));
    $$("[data-cat-id]").forEach((el) => (el.dataset.catId = c.id));

    const imgs = [p.image_url, ...(p.gallery || [])].filter(Boolean);
    const main = $("#art-image");
    main.src = imgs[0] || PLACEHOLDER;
    main.alt = `${p.title}${p.dimensions ? ", " + p.dimensions : ""}`;
    const th = $("#art-thumbs");
    if (th) {
      th.hidden = imgs.length < 2;
      th.innerHTML = imgs.map((u, i) => `<button type="button" class="thumb" aria-pressed="${i === 0}" aria-label="View image ${i + 1} of ${imgs.length}"><img src="${esc(u)}" alt=""></button>`).join("");
      th.onclick = (e) => {
        const b = e.target.closest(".thumb"); if (!b) return;
        $$(".thumb", th).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        main.src = b.querySelector("img").src;
        document.dispatchEvent(new CustomEvent("art:image", { detail: main.src }));
      };
    }
  }

  // ---------- Reviews ----------
  function renderReviews(list) {
    const box = $("#reviews-list");
    const n = list.length, avg = n ? list.reduce((s, r) => s + r.rating, 0) / n : 0;
    $$('[data-f="rating-avg"]').forEach((el) => (el.textContent = n ? avg.toFixed(1) : "–"));
    $$('[data-f="rating-count"]').forEach((el) => (el.textContent = n ? `${n} review${n === 1 ? "" : "s"}` : "No reviews yet"));
    $$("[data-rating-stars]").forEach((el) => (el.innerHTML = starsHTML(avg)));
    box.innerHTML = n
      ? list.map((r) => `<article class="review">
          <header><strong>${esc(r.reviewer_name)}</strong>${starsHTML(r.rating)}</header>
          <p>${esc(r.comment)}</p>
          <time datetime="${esc(r.created_at)}">${new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</time>
        </article>`).join("")
      : `<p class="state-msg">No reviews yet. If you've bought this piece, tell other buyers what you think.</p>`;
  }
  function setupReviewForm(p) {
    const f = $("#review-form"); if (!f) return;
    const err = $("#review-error"), msg = $("#review-msg");
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      err.hidden = true; msg.hidden = true;
      const name = f.reviewer_name.value.trim(), comment = f.comment.value.trim();
      const rating = Number((f.querySelector('input[name="rating"]:checked') || {}).value || 0);
      const problem = !rating ? "Choose a star rating." : !name ? "Enter your name." : !comment ? "Write a few words about the painting." : "";
      if (problem) { err.textContent = problem; err.hidden = false; return; }
      const btn = f.querySelector('button[type="submit"]'); btn.disabled = true;
      const { error } = await sb.from("reviews").insert({ painting_id: p.id, reviewer_name: name.slice(0, 60), rating, comment: comment.slice(0, 1000) });
      btn.disabled = false;
      if (error) { err.textContent = "Your review couldn't be posted. Try again."; err.hidden = false; return; }
      f.reset();
      msg.textContent = "Thanks! Your review is posted."; msg.hidden = false;
      const { data } = await sb.from("reviews").select("id,reviewer_name,rating,comment,created_at").eq("painting_id", p.id).order("created_at", { ascending: false });
      renderReviews(data || []);
    });
  }

  // ---------- Ordering ----------
  function setupOrder(p) {
    const f = $("#order-form");
    const el = (k) => f.elements.namedItem(k);
    const soldout = $("#soldout");
    if (p.quantity <= 0) { f.hidden = true; if (soldout) soldout.hidden = false; return; }
    if (soldout) soldout.hidden = true;
    f.hidden = false;
    const max = Math.min(20, p.quantity);
    const qty = $("#qty");
    qty.max = max;
    $$('[data-f="max"]').forEach((el) => (el.textContent = max));
    const saved = remember.get();
    ["name", "phone", "email", "address", "city"].forEach((k) => { if (saved[k] && el(k)) el(k).value = saved[k]; });
    if (saved.area && f.querySelector(`input[name="area"][value="${saved.area}"]`)) f.querySelector(`input[name="area"][value="${saved.area}"]`).checked = true;

    const val = () => ({
      qty: Math.max(1, Math.min(max, Math.floor(Number(qty.value) || 1))),
      area: (f.querySelector('input[name="area"]:checked') || {}).value || "",
      pay: (f.querySelector('input[name="pay"]:checked') || {}).value || "cod",
    });
    function update() {
      const v = val();
      if (String(v.qty) !== qty.value) qty.value = v.qty;
      $("#qty-minus").disabled = v.qty <= 1;
      $("#qty-plus").disabled = v.qty >= max;
      const sub = Number(p.price) * v.qty;
      const fee = v.area ? DELIVERY[v.area].fee : null;
      const set = (k, t) => $$(`[data-sum="${k}"]`).forEach((el) => (el.textContent = t));
      set("qty", `${v.qty} × ${tk(p.price)}`);
      set("sub", tk(sub));
      set("del", fee == null ? "Choose area" : tk(fee));
      set("del-label", v.area ? `Delivery (${DELIVERY[v.area].label})` : "Delivery");
      set("total", fee == null ? tk(sub) + " + delivery" : tk(sub + fee));
      const mob = v.pay !== "cod", mname = v.pay === "nagad" ? "Nagad" : "bKash";
      const btn = $("#order-btn");
      const total = fee == null ? "" : ` · ${tk(sub + fee)}`;
      btn.textContent = mob ? `Continue to payment${total}` : `Place order${total}`;
      $$("[data-pay-note]").forEach((el) => (el.textContent = mob ? "" : "Pay in cash to the delivery person when your painting arrives."));
      $("#mpay").hidden = !mob;
      $$('[data-mp="method"]').forEach((el) => (el.textContent = mname));
    }
    $("#qty-minus").onclick = () => { qty.value = val().qty - 1; update(); };
    $("#qty-plus").onclick = () => { qty.value = val().qty + 1; update(); };
    f.addEventListener("input", update);
    f.addEventListener("change", update);
    update();

    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = $("#order-error"); err.hidden = true;
      const v = val();
      const d = {
        name: el("name").value.trim(), phone: el("phone").value.replace(/[\s-]/g, ""), email: el("email").value.trim(),
        address: el("address").value.trim(), city: el("city").value.trim(),
      };
      const problem =
        !v.area ? "Choose your delivery area: inside or outside Dhaka." :
        !d.name ? "Enter your name." :
        !PHONE.test(d.phone) ? "Enter a valid Bangladeshi mobile number, like 01712345678." :
        d.email && !EMAIL.test(d.email) ? "Check your email address, or leave it empty." :
        !d.address ? "Enter your full delivery address." : "";
      if (problem) { err.textContent = problem; err.hidden = false; err.scrollIntoView({ block: "center", behavior: "smooth" }); return; }
      remember.set({ ...d, area: v.area });

      // Online payment (bKash / Nagad): carry the details to the payment page, where the TrxID is entered.
      if (v.pay !== "cod") {
        if (!draft.set({ pid: p.id, qty: v.qty, area: v.area, method: v.pay, ...d })) {
          err.textContent = "Your browser is blocking the temporary storage the payment page needs. Allow site data for this page, or choose Cash on Delivery.";
          err.hidden = false; return;
        }
        location.href = "pay.html";
        return;
      }

      const btn = $("#order-btn"), label = btn.textContent;
      btn.disabled = true; btn.textContent = "Placing your order…";
      try {
        const { data, error } = await sb.rpc("place_cod_order", {
          p_painting_id: p.id, p_qty: v.qty, p_name: d.name, p_phone: d.phone, p_email: d.email,
          p_address: d.address, p_city: d.city, p_area: v.area,
        });
        if (error) throw new Error(cleanDbError(error.message));
        location.href = `order.html?tran=${encodeURIComponent(data.tran_id)}&placed=cod#${encodeURIComponent(data.tran_id)}`;
      } catch (ex) {
        btn.disabled = false; btn.textContent = label;
        err.textContent = ex.message || "Something went wrong. Try again.";
        err.hidden = false;
      }
    });
  }
  function cleanDbError(m) {
    if (!m) return "Your order couldn't be placed. Try again.";
    if (/fetch|network/i.test(m)) return "No connection. Check your internet and try again.";
    return m.replace(/^.*?ERROR:\s*/i, "");
  }

  // ---------- Payment page (bKash / Nagad) ----------
  function copyText(btn, text, getNode) {
    btn.onclick = async () => {
      try { await navigator.clipboard.writeText(text); btn.textContent = "Copied ✓"; }
      catch (_) {
        const node = getNode && getNode();
        if (node) { const r = document.createRange(); r.selectNodeContents(node); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }
        btn.textContent = "Now press Copy";
      }
    };
  }
  function pageMessage(box, title, text, href, label) {
    box.innerHTML = `<div class="missing"><h1>${esc(title)}</h1><p>${esc(text)}</p>${href ? `<a class="btn" href="${esc(href)}">${esc(label)}</a>` : ""}</div>`;
  }
  async function initPay() {
    chrome();
    const box = $("#pay-box");
    const d = draft.get();
    if (!d) return pageMessage(box, "No order to pay for", "Pick an artwork, choose bKash or Nagad, and you'll land here to finish the payment.", "index.html", "Browse artworks");
    const { data: p, error } = await sb.from("paintings").select("id,title,price,image_url,quantity").eq("id", d.pid).maybeSingle();
    if (error) return pageMessage(box, "Couldn't load your order", "Check your internet connection and refresh this page.");
    if (!p) return pageMessage(box, "Artwork not available", "This artwork is no longer available.", "index.html", "See all artworks");
    if (p.quantity <= 0) return pageMessage(box, "Sold out", "Sorry, this piece sold out while you were checking out.", "index.html", "See all artworks");

    const qty = Math.max(1, Math.min(p.quantity, 20, Math.floor(Number(d.qty)) || 1));
    const fee = DELIVERY[d.area].fee, sub = Number(p.price) * qty, total = sub + fee;
    const number = C.CONTACT_PHONE;
    let method = d.method;
    const mlabel = () => (method === "nagad" ? "Nagad" : "bKash");

    box.innerHTML = `<a class="back" href="${esc(artUrl(p))}">← Change order details</a>
      <form class="order pay-card" id="pay-form" novalidate>
        <p class="pay-step">Step 2 of 2</p>
        <h1 class="order-title">Complete your payment</h1>
        <div class="order-item">
          <img src="${esc(imgOf(p))}" alt="">
          <div><strong>${esc(p.title)}</strong><span>Quantity: ${qty}</span><span>Deliver to: ${esc(d.name)}, ${esc(DELIVERY[d.area].label)}</span></div>
        </div>
        <dl class="sum">
          <div><dt>${qty} × ${tk(p.price)}</dt><dd>${tk(sub)}</dd></div>
          <div><dt>Delivery (${esc(DELIVERY[d.area].label)})</dt><dd>${tk(fee)}</dd></div>
          <div class="sum-total"><dt>Total to pay</dt><dd>${tk(total)}</dd></div>
        </dl>
        <fieldset>
          <legend>Pay with</legend>
          <div class="choice-grid">
            <label class="choice"><input type="radio" name="method" value="bkash" ${method === "bkash" ? "checked" : ""}><span><strong>bKash</strong><em>Send Money</em></span></label>
            <label class="choice"><input type="radio" name="method" value="nagad" ${method === "nagad" ? "checked" : ""}><span><strong>Nagad</strong><em>Send Money</em></span></label>
          </div>
        </fieldset>
        <div class="mpay">
          <ol>
            <li>Open your <b data-mp="method">${mlabel()}</b> app and choose <b>Send Money</b>.</li>
            <li>Send <b>${tk(total)}</b> to this number: <span class="numrow"><strong id="pay-number">${esc(number)}</strong><button type="button" class="btn ghost sm" id="pay-copy">Copy number</button></span><span class="hint pay-hint">It's the same number shown in the footer of this page.</span></li>
            <li>Copy the <b>Transaction ID (TrxID)</b> from the confirmation message and enter it below.</li>
          </ol>
          <label>Transaction ID (TrxID)<input name="trx" maxlength="20" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="e.g. 9A7B3C2D1E"></label>
          <label>Number you paid from<input name="sender" type="tel" inputmode="tel" autocomplete="tel" placeholder="01XXXXXXXXX"></label>
        </div>
        <p class="form-error" id="pay-error" role="alert" hidden></p>
        <button class="btn block" id="pay-btn" type="submit">Confirm order · ${tk(total)}</button>
        <p class="secure-note">We check your TrxID in our bKash/Nagad account and confirm by phone or message. Delivery takes 5–7 business days.</p>
      </form>`;
    copyText($("#pay-copy"), number, () => $("#pay-number"));

    const form = $("#pay-form");
    form.addEventListener("change", (e) => {
      if (e.target.name !== "method") return;
      method = e.target.value;
      $$('[data-mp="method"]').forEach((el) => (el.textContent = mlabel()));
      draft.set({ ...d, method });
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = $("#pay-error"); err.hidden = true;
      const trx = form.elements.namedItem("trx").value.replace(/\s/g, "").toUpperCase();
      const sender = form.elements.namedItem("sender").value.replace(/[\s-]/g, "");
      const problem =
        !/^[A-Z0-9]{6,20}$/.test(trx) ? "Enter the Transaction ID (TrxID) from your payment message: 6 to 20 letters and numbers, no spaces." :
        !PHONE.test(sender) ? `Enter the ${mlabel()} number you paid from, like 01712345678.` : "";
      if (problem) { err.textContent = problem; err.hidden = false; err.scrollIntoView({ block: "center", behavior: "smooth" }); return; }
      const btn = $("#pay-btn"), label = btn.textContent;
      btn.disabled = true; btn.textContent = "Placing your order…";
      try {
        const { data, error: rpcErr } = await sb.rpc("place_mobile_order", {
          p_painting_id: p.id, p_qty: qty, p_name: d.name, p_phone: d.phone, p_email: d.email || "",
          p_address: d.address, p_city: d.city || "", p_area: d.area, p_method: method, p_trx: trx, p_sender: sender,
        });
        if (rpcErr) throw new Error(cleanDbError(rpcErr.message));
        draft.clear();
        location.replace(`order.html?tran=${encodeURIComponent(data.tran_id)}&placed=${method}#${encodeURIComponent(data.tran_id)}`);
      } catch (ex) {
        btn.disabled = false; btn.textContent = label;
        err.textContent = ex.message || "Something went wrong. Try again.";
        err.hidden = false; err.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    });
  }

  // ---------- Customized paintings: request form ----------
  function initCustom() {
    chrome();
    const f = $("#custom-form"); if (!f) return;
    const el = (k) => f.elements.namedItem(k);
    const err = $("#custom-error"), done = $("#custom-done");
    const saved = remember.get();
    ["name", "phone", "email"].forEach((k) => { if (saved[k] && el(k)) el(k).value = saved[k]; });
    $("#custom-again").onclick = () => { done.hidden = true; f.hidden = false; f.reset(); ["name", "phone", "email"].forEach((k) => { if (saved[k] && el(k)) el(k).value = saved[k]; }); };
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      err.hidden = true;
      if (el("website").value) { f.hidden = true; done.hidden = false; return; } // hidden spam-trap field
      const d = {
        customer_name: el("name").value.trim(), customer_phone: el("phone").value.replace(/[\s-]/g, ""),
        customer_email: el("email").value.trim(), idea: el("idea").value.trim(),
        size: el("size").value.trim(), budget: el("budget").value.trim(),
      };
      const problem =
        !d.customer_name ? "Enter your name." :
        !PHONE.test(d.customer_phone) ? "Enter a valid Bangladeshi mobile number, like 01712345678." :
        d.customer_email && !EMAIL.test(d.customer_email) ? "Check your email address, or leave it empty." :
        d.idea.length < 5 ? "Tell us a little about the painting you have in mind." : "";
      if (problem) { err.textContent = problem; err.hidden = false; err.scrollIntoView({ block: "center", behavior: "smooth" }); return; }
      const btn = $("#custom-btn"), label = btn.textContent;
      btn.disabled = true; btn.textContent = "Sending…";
      const { error } = await sb.from("custom_requests").insert(d);
      btn.disabled = false; btn.textContent = label;
      if (error) {
        err.textContent = /fetch|network/i.test(error.message) ? "No connection. Check your internet and try again." : "Your request couldn't be sent. Try again, or call us instead.";
        err.hidden = false; return;
      }
      remember.set({ ...remember.get(), name: d.customer_name, phone: d.customer_phone, email: d.customer_email });
      $$("[data-done-phone]").forEach((n) => (n.textContent = d.customer_phone));
      f.hidden = true; done.hidden = false;
      done.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }

  // ---------- Order confirmation ----------
  async function initOrder() {
    chrome();
    const q = new URLSearchParams(location.search);
    const tran = q.get("tran") || decodeURIComponent(location.hash.slice(1)) || "";
    const box = $("#order-box");
    if (!tran) return renderOrder(box, { state: "missing" });
    const { data: o, error } = await sb.rpc("get_order_status", { p_tran: tran });
    if (error) return renderOrder(box, { state: "error", tran });
    if (!o) return renderOrder(box, { state: "missing", tran });
    let state = "failed"; // an order that never completed
    if (o.status === "cod") state = "cod";
    else if (o.status === "paid") state = "paid";
    else if (o.status === "cancelled") state = "cancelled";
    else if (o.status === "pending" && ["bkash", "nagad"].includes(o.payment_method)) state = "verify";
    renderOrder(box, { state, order: o, tran });
  }
  function renderOrder(box, { state, order: o, tran }) {
    const TXT = {
      cod: ["Order successful", "Thank you! Pay the total in cash when your painting arrives. We'll call you to confirm delivery. Delivery takes 5–7 business days."],
      verify: ["Order successful", "Thank you! We've received your Transaction ID and will check your payment, then confirm by phone or message. Delivery takes 5–7 business days after confirmation."],
      paid: ["Order successful", "Your payment has been received and your painting is being prepared. Delivery takes 5–7 business days."],
      failed: ["Order not completed", "This order wasn't completed. You can order the painting again any time."],
      cancelled: ["Order cancelled", "This order was cancelled. You can order the painting again any time."],
      missing: ["Order not found", "We couldn't find this order. Check the link, or contact us with your order code."],
      error: ["Couldn't load your order", "Check your internet connection and refresh this page."],
    };
    const [h, m] = TXT[state] || TXT.missing;
    const ful = { new: "Order received", processing: "Being prepared", shipped: "On the way", delivered: "Delivered", returned: "Returned" };
    const success = state === "cod" || state === "paid" || state === "verify";
    const code = o ? o.tran_id : tran || "";
    let body = "";
    if (success && code) {
      body += `<div class="order-code">
          <span class="order-code-label">Your order code</span>
          <strong class="code" id="order-code">${esc(code)}</strong>
          <button type="button" class="btn ghost sm" data-copy-code>Copy code</button>
          <span class="order-code-note">Keep this code in case you need to contact us.</span>
        </div>`;
    }
    if (o) {
      body += `<div class="order-item">
          <img src="${esc(o.image_url || PLACEHOLDER)}" alt="">
          <div><strong>${esc(o.title)}</strong><span>Quantity: ${o.quantity}</span>${success ? `<span>Status: ${ful[o.fulfillment] || "Order received"}</span>` : ""}</div>
        </div>
        <dl class="receipt">
          <div><dt>Artwork</dt><dd>${tk(o.subtotal)}</dd></div>
          <div><dt>Delivery (${o.delivery_area === "outside_dhaka" ? "Outside Dhaka" : "Inside Dhaka"})</dt><dd>${tk(o.delivery_charge)}</dd></div>
          <div class="total"><dt>${state === "cod" ? "Pay on delivery" : state === "paid" ? "Paid" : state === "verify" ? "Total (payment being checked)" : "Total"}</dt><dd>${tk(o.amount)}</dd></div>
        </dl>`;
    } else if (tran && !success) {
      body += `<p class="order-code"><span class="order-code-label">Order code</span><strong class="code">${esc(tran)}</strong></p>`;
    }
    const retry = o && o.painting_id && ["failed", "cancelled"].includes(state) ? `<a class="btn" href="${esc(window.Store.artUrl({ id: o.painting_id }))}">Try again</a>` : "";
    box.innerHTML = `<div class="order-card" data-state="${state}">
        <div class="order-icon" aria-hidden="true"></div>
        <h1>${h}</h1><p class="order-lead">${m}</p>${body}
        <div class="order-actions">${retry}<a class="btn ${retry ? "ghost" : ""}" href="index.html">Keep browsing</a></div>
        <p class="order-help">Questions? Call <a data-contact-phone></a> or email <a data-contact-email></a>.</p>
      </div>`;
    const cb = $("[data-copy-code]", box);
    if (cb) copyText(cb, code, () => $("#order-code"));
    chrome();
  }

  window.Store = { sb, CATS, DELIVERY, esc, tk, cat, imgOf, artUrl, stock, starsHTML, PLACEHOLDER, chrome, initHome, initCategory, initArt, initOrder, initPay, initCustom };
})();
