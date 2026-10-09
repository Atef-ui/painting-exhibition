/* Admin panel: sign in, manage artworks and stock, orders and reviews. */
(function () {
  const { sb, CATS, esc, tk, cat, PLACEHOLDER, chrome } = window.Store;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const MAX_IMG = 8 * 1024 * 1024;
  let paintings = [], orders = [], requests = [], editing = null, newGallery = [], keepGallery = [];

  let toastTimer;
  function toast(msg, bad) {
    const t = $("#toast"); t.textContent = msg; t.dataset.bad = bad ? "1" : "";
    t.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 3200);
  }

  // ---------- Auth ----------
  async function boot() {
    chrome();
    $("#login-form").addEventListener("submit", signIn);
    $("#signout").addEventListener("click", async () => { await sb.auth.signOut(); showLogin(); });
    const { data } = await sb.auth.getSession();
    if (data.session) await enter(data.session.user); else showLogin();
  }
  function showLogin(msg) {
    $("#login").hidden = false; $("#app").hidden = true; $("#signout").hidden = true;
    const em = $("#login-email");
    let last = ""; try { last = localStorage.getItem("rt.adminEmail") || ""; } catch (_) {}
    if (!em.value && last) { em.value = last; $("#login-pass").focus(); }
    const e = $("#login-error"); e.hidden = !msg; e.textContent = msg || "";
  }
  async function signIn(e) {
    e.preventDefault();
    const btn = e.submitter || $("#login-form button"); btn.disabled = true;
    const { data, error } = await sb.auth.signInWithPassword({ email: $("#login-email").value.trim(), password: $("#login-pass").value });
    btn.disabled = false;
    if (error) return showLogin(/invalid/i.test(error.message) ? "Wrong email or password." : error.message);
    await enter(data.user);
  }
  async function enter(user) {
    const { data } = await sb.from("admins").select("user_id").eq("user_id", user.id).maybeSingle();
    if (!data) { await sb.auth.signOut(); return showLogin(`${user.email} is signed in but isn't an admin. Ask the owner to add this account to the admins table.`); }
    $("#login").hidden = true; $("#app").hidden = false; $("#signout").hidden = false;
    $("#who").textContent = user.email;
    try { localStorage.setItem("rt.adminEmail", user.email); } catch (_) {}
    loadPaintings(); loadOrders(); loadRequests(); loadReviews();
  }

  // ---------- Tabs ----------
  $$(".tabs button").forEach((b) => b.addEventListener("click", () => {
    $$(".tabs button").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
    $$(".panel").forEach((p) => (p.hidden = p.id !== b.dataset.panel));
  }));

  // ---------- Artworks ----------
  async function loadPaintings() {
    const { data, error } = await sb.from("paintings").select("*").order("created_at", { ascending: false });
    if (error) { $("#art-rows").innerHTML = `<p class="state-msg">Artworks couldn't load: ${esc(error.message)}</p>`; return; }
    paintings = data || [];
    renderPaintings();
  }
  function renderPaintings() {
    const filter = $("#art-filter").value;
    const list = paintings.filter((p) => filter === "all" || (filter === "low" ? p.quantity <= 3 : p.category === filter));
    $("#stat-art").textContent = paintings.length;
    $("#stat-low").textContent = paintings.filter((p) => p.quantity > 0 && p.quantity <= 3).length;
    $("#stat-out").textContent = paintings.filter((p) => p.quantity <= 0).length;
    $("#art-rows").innerHTML = list.length ? list.map((p) => `
      <div class="arow" data-id="${p.id}">
        <img src="${esc(p.image_url || PLACEHOLDER)}" alt="">
        <div class="ainfo">
          <strong>${esc(p.title)}</strong>
          <span>${esc(cat(p.category).short)}${p.dimensions ? " · " + esc(p.dimensions) : ""}${p.featured ? " · Featured" : ""}</span>
          <span class="aprice">${tk(p.price)}</span>
        </div>
        <div class="stockctl" aria-label="Stock for ${esc(p.title)}">
          <span class="lbl">In stock</span>
          <div class="stepper">
            <button type="button" data-step="-1" aria-label="One fewer">−</button>
            <input type="number" min="0" max="9999" value="${p.quantity}" data-qty aria-label="Stock for ${esc(p.title)}">
            <button type="button" data-step="1" aria-label="One more">+</button>
          </div>
          <span class="pill ${p.quantity <= 0 ? "out" : p.quantity <= 3 ? "low" : "in"}">${p.quantity <= 0 ? "Sold out" : p.quantity <= 3 ? "Low" : "In stock"}</span>
        </div>
        <div class="sold"><span class="lbl">Sold</span><strong>${p.sold || 0}</strong></div>
        <div class="aact">
          <a class="btn ghost sm" href="${esc(window.Store.artUrl(p))}" target="_blank" rel="noopener">View</a>
          <button class="btn ghost sm" data-edit>Edit</button>
          <button class="btn ghost sm danger" data-del>Delete</button>
        </div>
      </div>`).join("") : `<p class="state-msg">No artworks here yet. Select Add artwork to create one.</p>`;
  }
  $("#art-filter").addEventListener("change", renderPaintings);

  const stockTimers = {};
  $("#art-rows").addEventListener("click", (e) => {
    const row = e.target.closest(".arow"); if (!row) return;
    const p = paintings.find((x) => x.id === row.dataset.id);
    const step = e.target.closest("[data-step]");
    if (step) { const inp = $("[data-qty]", row); inp.value = Math.max(0, (Number(inp.value) || 0) + Number(step.dataset.step)); queueStock(p, inp); }
    if (e.target.closest("[data-edit]")) openForm(p);
    if (e.target.closest("[data-del]")) deletePainting(p);
  });
  $("#art-rows").addEventListener("input", (e) => {
    const inp = e.target.closest("[data-qty]"); if (!inp) return;
    queueStock(paintings.find((x) => x.id === e.target.closest(".arow").dataset.id), inp);
  });
  function queueStock(p, inp) {
    clearTimeout(stockTimers[p.id]);
    stockTimers[p.id] = setTimeout(async () => {
      const q = Math.max(0, Math.floor(Number(inp.value) || 0));
      const { error } = await sb.from("paintings").update({ quantity: q }).eq("id", p.id);
      if (error) { toast("Stock couldn't be saved: " + error.message, true); inp.value = p.quantity; return; }
      p.quantity = q; renderPaintings(); toast(`Stock for "${p.title}" is now ${q}`);
    }, 600);
  }
  async function deletePainting(p) {
    if (!confirm(`Delete "${p.title}"? Its reviews are deleted too. This can't be undone.`)) return;
    const { count } = await sb.from("orders").select("id", { count: "exact", head: true }).eq("painting_id", p.id).neq("status", "cancelled");
    console.log("Orders count for painting", p.id, count);
    if (count) { toast(`"${p.title}" has ${count} order${count > 1 ? "s" : ""}, so it can't be deleted. Set its stock to 0 to stop selling it.`, true); return; }
    await sb.from("reviews").delete().eq("painting_id", p.id);
    const { error } = await sb.from("paintings").delete().eq("id", p.id);
    if (error) { toast("Couldn't delete: " + error.message, true); return; }
    paintings = paintings.filter((x) => x.id !== p.id); renderPaintings();
    if (p.image_path) {
      const { error: storageError } = await sb.storage.from("paintings").remove([p.image_path]);
      if (storageError) { toast("Artwork deleted, but its Storage image couldn't be deleted: " + storageError.message, true); return; }
      toast("Artwork and image deleted");
    } else toast("Artwork deleted; no image_path is saved for its Storage image.", true);
  }

  // ---------- Add / edit form ----------
  const dlg = $("#art-dialog"), form = $("#art-form");
  const fld = (k) => form.elements.namedItem(k);
  $("#add-art").addEventListener("click", () => openForm(null));
  $("#art-cancel").addEventListener("click", () => dlg.close());
  $("#size-presets").addEventListener("click", (e) => { const b = e.target.closest("[data-size]"); if (b) fld("dimensions").value = b.dataset.size; });
  fld("image").addEventListener("change", () => {
    const f = fld("image").files[0];
    $("#img-preview").src = f ? URL.createObjectURL(f) : (editing && editing.image_url) || PLACEHOLDER;
  });
  fld("gallery").addEventListener("change", () => { newGallery = Array.from(fld("gallery").files); renderGallery(); });
  $("#gallery-list").addEventListener("click", (e) => {
    const b = e.target.closest("[data-rm]"); if (!b) return;
    const [kind, i] = b.dataset.rm.split(":");
    if (kind === "keep") keepGallery.splice(+i, 1); else { newGallery.splice(+i, 1); }
    renderGallery();
  });
  function renderGallery() {
    $("#gallery-list").innerHTML =
      keepGallery.map((u, i) => `<span class="gthumb"><img src="${esc(u)}" alt=""><button type="button" data-rm="keep:${i}" aria-label="Remove image">×</button></span>`).join("") +
      newGallery.map((f, i) => `<span class="gthumb new"><img src="${URL.createObjectURL(f)}" alt=""><button type="button" data-rm="new:${i}" aria-label="Remove image">×</button></span>`).join("");
  }
  function openForm(p) {
    editing = p; form.reset(); $("#form-error").hidden = true;
    $("#form-title").textContent = p ? `Edit "${p.title}"` : "Add artwork";
    fld("category").innerHTML = CATS.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
    if (p) {
      ["title", "artist", "price", "dimensions", "medium", "description", "quantity", "sold", "category"].forEach((k) => (fld(k).value = p[k] ?? ""));
      fld("featured").checked = !!p.featured;
    } else { fld("quantity").value = 1; fld("sold").value = 0; }
    $("#img-preview").src = (p && p.image_url) || PLACEHOLDER;
    fld("image").required = !p;
    keepGallery = p ? [...(p.gallery || [])] : []; newGallery = []; renderGallery();
    dlg.showModal(); fld("title").focus();
  }
  async function upload(file) {
    if (!file.type.startsWith("image/")) throw new Error(`${file.name} isn't an image.`);
    if (file.size > MAX_IMG) throw new Error(`${file.name} is larger than 8 MB. Use a smaller photo.`);
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await sb.storage.from("paintings").upload(path, file, { contentType: file.type, cacheControl: "31536000" });
    if (error) throw new Error("Image upload failed: " + error.message);
    return { path, url: sb.storage.from("paintings").getPublicUrl(path).data.publicUrl };
  }
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#form-error"); err.hidden = true;
    const btn = $("#art-save"); btn.disabled = true; btn.textContent = "Saving…";
    try {
      const price = Number(fld("price").value), quantity = Math.floor(Number(fld("quantity").value)), sold = Math.floor(Number(fld("sold").value) || 0);
      if (!fld("title").value.trim()) throw new Error("Enter the art name.");
      if (!(price > 0)) throw new Error("Enter a price above 0.");
      if (!(quantity >= 0)) throw new Error("Stock can't be negative.");
      const row = {
        title: fld("title").value.trim(), artist: fld("artist").value.trim(), category: fld("category").value,
        price, dimensions: fld("dimensions").value.trim(), medium: fld("medium").value.trim(),
        description: fld("description").value.trim(), quantity, sold: Math.max(0, sold), featured: fld("featured").checked,
      };
      const main = fld("image").files[0];
      if (!editing && !main) throw new Error("Add a photo of the painting.");
      let oldPath = null;
      if (main) { const u = await upload(main); row.image_url = u.url; oldPath = editing && editing.image_path; row.image_path = u.path; }
      const added = [];
      for (const f of newGallery) added.push((await upload(f)).url);
      row.gallery = [...keepGallery, ...added];
      const q = editing ? sb.from("paintings").update(row).eq("id", editing.id).select().single() : sb.from("paintings").insert(row).select().single();
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      if (oldPath) sb.storage.from("paintings").remove([oldPath]).catch(() => {});
      if (editing) paintings = paintings.map((x) => (x.id === data.id ? data : x)); else paintings.unshift(data);
      renderPaintings(); dlg.close(); toast(editing ? "Artwork updated" : "Artwork added");
    } catch (ex) {
      err.textContent = ex.message; err.hidden = false;
    } finally { btn.disabled = false; btn.textContent = "Save artwork"; }
  });

  // ---------- Orders ----------
  const FUL = { new: "New", processing: "Preparing", shipped: "Shipped", delivered: "Delivered", returned: "Returned" };
  async function loadOrders() {
    const { data, error } = await sb.from("orders").select("*").order("created_at", { ascending: false }).limit(500);
    if (error) { $("#order-rows").innerHTML = `<p class="state-msg">Orders couldn't load: ${esc(error.message)}</p>`; return; }
    orders = data || []; renderOrders();
  }
  const MOBILE = ["bkash", "nagad"], METHOD = { cod: "COD", bkash: "bKash", nagad: "Nagad" };
  function statusPill(o) {
    if (o.status === "cod") return `<span class="pill low">Cash due on delivery</span>`;
    if (o.status === "paid") return `<span class="pill in">${o.payment_method === "cod" ? "Cash received" : "Payment received"}</span>`;
    if (o.status === "pending" && MOBILE.includes(o.payment_method)) return `<span class="pill low">Verify ${METHOD[o.payment_method]} payment</span>`;
    if (o.status === "pending" || o.status === "failed") return `<span class="pill out">Not completed</span>`;
    return `<span class="pill out">Cancelled</span>`;
  }
  function renderOrders() {
    const f = $("#order-filter").value;
    const live = (o) => o.status === "cod" || o.status === "paid" || (o.status === "pending" && MOBILE.includes(o.payment_method));
    const list = orders.filter((o) =>
      f === "all" ? true : f === "open" ? live(o) && !["delivered", "returned"].includes(o.fulfillment) :
      f === "cod" ? o.status === "cod" : f === "paid" ? o.status === "paid" : f === "unpaid" ? ["pending", "failed"].includes(o.status) : o.status === "cancelled");
    $("#stat-open").textContent = orders.filter((o) => live(o) && !["delivered", "returned"].includes(o.fulfillment)).length;
    $("#stat-cod").textContent = tk(orders.filter((o) => o.status === "cod").reduce((s, o) => s + Number(o.amount), 0));
    $("#stat-paid").textContent = tk(orders.filter((o) => o.status === "paid").reduce((s, o) => s + Number(o.amount), 0));
    $("#order-rows").innerHTML = list.length ? list.map((o) => {
      const sub = o.subtotal != null ? Number(o.subtotal) : Number(o.amount) - Number(o.delivery_charge || 0);
      const canAct = o.status !== "cancelled";
      return `<article class="ocard" data-id="${o.id}">
        <header>
          <div><strong>${esc(o.painting_title)}</strong> × ${o.quantity}<span class="muted"> · ${new Date(o.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span></div>
          <div class="pills">${statusPill(o)}<span class="pill">${METHOD[o.payment_method] || o.payment_method}</span></div>
        </header>
        <div class="ogrid">
          <div><span class="lbl">Customer</span>${esc(o.customer_name)}<br><a href="tel:${esc(o.customer_phone)}">${esc(o.customer_phone)}</a>${o.customer_email ? `<br><a href="mailto:${esc(o.customer_email)}">${esc(o.customer_email)}</a>` : ""}</div>
          <div><span class="lbl">Deliver to (${o.delivery_area === "outside_dhaka" ? "outside Dhaka" : "inside Dhaka"})</span>${esc(o.customer_address)}${o.customer_city ? `, ${esc(o.customer_city)}` : ""}</div>
          ${MOBILE.includes(o.payment_method) ? `<div><span class="lbl">${METHOD[o.payment_method]} payment</span>Transaction ID <strong>${esc(o.payment_trx)}</strong><br>Paid from ${esc(o.payment_sender)}</div>` : ""}
          <div><span class="lbl">Amount</span>${tk(sub)} + ${tk(o.delivery_charge)} delivery<br><strong>${tk(o.amount)}</strong></div>
        </div>
        <footer>
          <span class="muted small">Order ${esc(o.tran_id)}</span>
          <div class="oact">
            ${canAct && live(o) ? `<label class="sel"><span class="sr">Delivery status</span><select data-ful>${Object.entries(FUL).map(([k, v]) => `<option value="${k}" ${o.fulfillment === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>` : ""}
            ${o.status === "cod" ? `<button class="btn sm" data-act="cash_received">Cash received</button>` : ""}
            ${o.status === "pending" && MOBILE.includes(o.payment_method) ? `<button class="btn sm" data-act="payment_received">Payment received</button>` : ""}
            ${canAct ? `<button class="btn ghost sm danger" data-act="cancel">Cancel order</button>` : ""}
          </div>
        </footer>
      </article>`;
    }).join("") : `<p class="state-msg">No orders match this filter.</p>`;
  }
  $("#order-filter").addEventListener("change", renderOrders);
  $("#refresh-orders").addEventListener("click", () => { loadOrders(); loadPaintings(); toast("Orders refreshed"); });
  async function orderAction(id, action, el) {
    if (action === "cancel" && !confirm("Cancel this order? If stock was taken for it, the stock is put back.")){return;}
    if (el) el.disabled = true;
    const { data, error } = await sb.rpc("admin_update_order", { p_order: id, p_action: action });
    if (el) el.disabled = false;
    if (error) { toast(error.message, true); renderOrders(); return; }
    orders = orders.map((o) => (o.id === id ? data : o)); renderOrders();
    if (action === "cancel") loadPaintings();
    toast(action === "cancel" ? "Order cancelled" : action === "cash_received" || action === "payment_received" ? "Marked as paid" : `Marked as ${FUL[action].toLowerCase()}`);
  }
  $("#order-rows").addEventListener("click", (e) => { const b = e.target.closest("[data-act]"); if (b) orderAction(b.closest(".ocard").dataset.id, b.dataset.act, b); });
  $("#order-rows").addEventListener("change", (e) => { const s = e.target.closest("[data-ful]"); if (s) orderAction(s.closest(".ocard").dataset.id, s.value, s); });

  // ---------- Custom painting requests ----------
  const REQ = { new: "New", contacted: "Contacted", done: "Done", declined: "Declined" };
  async function loadRequests() {
    const { data, error } = await sb.from("custom_requests").select("*").order("created_at", { ascending: false }).limit(500);
    if (error) { $("#req-rows").innerHTML = `<p class="state-msg">Requests couldn't load: ${esc(error.message)}</p>`; return; }
    requests = data || []; renderRequests();
  }
  function renderRequests() {
    const f = $("#req-filter").value;
    const list = requests.filter((r) => f === "all" ? true : f === "open" ? ["new", "contacted"].includes(r.status) : r.status === f);
    $("#stat-req-new").textContent = requests.filter((r) => r.status === "new").length;
    $("#stat-req-open").textContent = requests.filter((r) => ["new", "contacted"].includes(r.status)).length;
    $("#stat-req-all").textContent = requests.length;
    const cls = { new: "low", contacted: "", done: "in", declined: "out" };
    $("#req-rows").innerHTML = list.length ? list.map((r) => `
      <article class="ocard" data-id="${r.id}">
        <header>
          <div><strong>${esc(r.customer_name)}</strong><span class="muted"> · ${new Date(r.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span></div>
          <div class="pills"><span class="pill ${cls[r.status] || ""}">${REQ[r.status] || esc(r.status)}</span></div>
        </header>
        <div class="ogrid">
          <div><span class="lbl">Contact</span><a href="tel:${esc(r.customer_phone)}">${esc(r.customer_phone)}</a>${r.customer_email ? `<br><a href="mailto:${esc(r.customer_email)}">${esc(r.customer_email)}</a>` : ""}</div>
          <div><span class="lbl">Canvas size</span>${esc(r.size) || "Not given"}</div>
          <div><span class="lbl">Budget</span>${esc(r.budget) || "Not given"}</div>
        </div>
        <p class="req-idea">${esc(r.idea)}</p>
        <footer>
          <span class="muted small">Customized painting request</span>
          <div class="oact">
            <label class="sel"><span class="sr">Status</span><select data-req-status>${Object.entries(REQ).map(([k, v]) => `<option value="${k}" ${r.status === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
            <button class="btn ghost sm danger" data-req-del>Delete</button>
          </div>
        </footer>
      </article>`).join("") : `<p class="state-msg">No requests match this filter.</p>`;
  }
  $("#req-filter").addEventListener("change", renderRequests);
  $("#refresh-requests").addEventListener("click", () => { loadRequests(); toast("Requests refreshed"); });
  $("#req-rows").addEventListener("change", async (e) => {
    const sel = e.target.closest("[data-req-status]"); if (!sel) return;
    const id = sel.closest(".ocard").dataset.id; sel.disabled = true;
    const { data, error } = await sb.from("custom_requests").update({ status: sel.value }).eq("id", id).select().maybeSingle();
    sel.disabled = false;
    if (error || !data) { toast("Couldn't update: " + (error ? error.message : "not allowed"), true); renderRequests(); return; }
    requests = requests.map((r) => (r.id === id ? data : r)); renderRequests(); toast(`Marked as ${REQ[data.status].toLowerCase()}`);
  });
  $("#req-rows").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-req-del]"); if (!b) return;
    if (!confirm("Delete this request for good?")) return;
    const id = b.closest(".ocard").dataset.id;
    const { error } = await sb.from("custom_requests").delete().eq("id", id);
    if (error) { toast("Couldn't delete: " + error.message, true); return; }
    requests = requests.filter((r) => r.id !== id); renderRequests(); toast("Request deleted");
  });

  // ---------- Reviews ----------
  async function loadReviews() {
    const { data, error } = await sb.from("reviews").select("id,reviewer_name,rating,comment,created_at,painting_id,paintings(title)").order("created_at", { ascending: false }).limit(300);
    const box = $("#review-rows");
    if (error) { box.innerHTML = `<p class="state-msg">Reviews couldn't load: ${esc(error.message)}</p>`; return; }
    box.innerHTML = (data || []).length ? data.map((r) => `
      <article class="rcard" data-id="${r.id}">
        <div><strong>${esc(r.reviewer_name)}</strong> ${window.Store.starsHTML(r.rating)} <span class="muted small">on ${esc(r.paintings ? r.paintings.title : "a deleted artwork")} · ${new Date(r.created_at).toLocaleDateString("en-GB")}</span><p>${esc(r.comment)}</p></div>
        <button class="btn ghost sm danger" data-rdel>Delete</button>
      </article>`).join("") : `<p class="state-msg">No reviews yet.</p>`;
  }
  $("#review-rows").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-rdel]"); if (!b) return;
    if (!confirm("Delete this review?")) return;
    const card = b.closest(".rcard");
    const { error } = await sb.from("reviews").delete().eq("id", card.dataset.id);
    if (error) { toast("Couldn't delete: " + error.message, true); return; }
    card.remove(); toast("Review deleted");
  });

  boot();
})();
