/* Design B: Pop Studio. Bold bordered cards with stickers for stock and sales. */
window.UI = {
  card(p) {
    const { esc, tk, stock, imgOf, artUrl } = window.Store;
    const st = stock(p);
    return `<a class="card" href="${artUrl(p)}" data-c="${esc(p.category)}" data-stock="${st.key}">
      <div class="card-img">
        <img loading="lazy" src="${esc(imgOf(p))}" alt="${esc(p.title)}">
        <span class="badge ${st.key}">${st.label}</span>
      </div>
      <div class="card-body">
        <h3>${esc(p.title)}</h3>
        <p>${esc([p.dimensions, p.medium].filter(Boolean).join(" · ") || "Original painting")}</p>
        <div class="card-row">
          <span class="price-tag">${tk(p.price)}</span>
          ${p.sold ? `<span class="sold">${p.sold} sold</span>` : ""}
        </div>
      </div>
    </a>`;
  },
  hero(p) {
    const { esc, tk, imgOf, artUrl, cat } = window.Store;
    document.getElementById("hero-art").innerHTML = `
      <a class="card hero-card" href="${artUrl(p)}" data-c="${esc(p.category)}">
        <span class="sticker pink hero-sticker">Featured</span>
        <div class="card-img"><img src="${esc(imgOf(p))}" alt="${esc(p.title)}"></div>
        <div class="card-body">
          <span class="cat-pill" data-c="${esc(p.category)}">${esc(cat(p.category).short)}</span>
          <h3>${esc(p.title)}</h3>
          <div class="card-row"><span class="price-tag">${tk(p.price)}</span><span class="go">View →</span></div>
        </div>
      </a>`;
  },
};
