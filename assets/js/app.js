(function () {
  "use strict";
  var C = window.STORE_CONFIG || {};
  var $ = function (s) { return document.querySelector(s); };
  var products = [];
  var cart = loadCart();
  var activeCat = "Semua";
  var query = "";
  var lastWaUrl = "";

  /* ---------- Utilitas ---------- */
  function rupiah(n) { return "Rp " + Number(n || 0).toLocaleString("id-ID"); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function initials(name) {
    return String(name).split(/\s+/).slice(0, 2).map(function (w) { return w.charAt(0); }).join("").toUpperCase();
  }
  function toast(msg) {
    var t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("show"); }, 1800);
  }
  function loadCart() {
    try { return JSON.parse(localStorage.getItem("hs_cart") || "{}"); } catch (e) { return {}; }
  }
  function saveCart() {
    try { localStorage.setItem("hs_cart", JSON.stringify(cart)); } catch (e) {}
  }
  function track(event, data) {
    if (window.fbq) { try { window.fbq("track", event, data || {}); } catch (e) {} }
  }

  /* ---------- Parser CSV sederhana (mendukung tanda kutip) ---------- */
  function parseCSV(text) {
    var rows = [], row = [], field = "", inQ = false;
    text = text.replace(/^﻿/, "");
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (inQ) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
        } else field += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ",") { row.push(field); field = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(field); rows.push(row); row = []; field = "";
      } else field += ch;
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    var head = rows.shift().map(function (h) { return h.trim().toLowerCase(); });
    return rows.filter(function (r) { return r.join("").trim(); }).map(function (r) {
      var o = {}; head.forEach(function (h, i) { o[h] = (r[i] || "").trim(); }); return o;
    });
  }

  /* ---------- Muat produk ---------- */
  function loadProducts() {
    fetch(C.productsCsvUrl || "data/products.csv", { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then(function (txt) {
        products = parseCSV(txt)
          .filter(function (p) { return p.kode && p.nama && String(p.aktif || "ya").toLowerCase() !== "tidak"; })
          .map(function (p) {
            p.harga = Number(String(p.harga).replace(/[^\d]/g, "")) || 0;
            p.kategori = p.kategori || "Lainnya";
            return p;
          });
        // bersihkan keranjang dari produk yang sudah tidak ada
        Object.keys(cart).forEach(function (k) { if (!findP(k)) delete cart[k]; });
        saveCart();
        renderCategories(); renderFeatured(); renderProducts(); renderCart();
      })
      .catch(function () {
        $("#productGrid").innerHTML = '<p class="muted center">Produk gagal dimuat. Pastikan situs dibuka lewat hosting (bukan klik file langsung) dan link CSV benar.</p>';
      });
  }
  function findP(kode) {
    for (var i = 0; i < products.length; i++) if (products[i].kode === kode) return products[i];
    return null;
  }

  /* ---------- Render katalog ---------- */
  function renderCategories() {
    var cats = ["Semua"];
    products.forEach(function (p) { if (cats.indexOf(p.kategori) < 0) cats.push(p.kategori); });
    $("#categories").innerHTML = cats.map(function (c) {
      return '<button class="chip' + (c === activeCat ? " active" : "") + '" data-cat="' + esc(c) + '">' + esc(c) + "</button>";
    }).join("");
  }
  function imgHTML(p) {
    return p.foto
      ? '<img src="' + esc(p.foto) + '" alt="' + esc(p.nama) + '" loading="lazy" onerror="this.remove()">'
      : "";
  }
  /* Tombol di kartu: "+ Keranjang", atau pengatur jumlah jika sudah di keranjang */
  function actionHTML(kode) {
    var n = cart[kode] || 0;
    if (!n) return '<button class="btn btn-primary card-add" data-add="' + esc(kode) + '">+ Keranjang</button>';
    return '<div class="card-qty"><button data-dec="' + esc(kode) + '" aria-label="Kurangi">−</button>' +
      "<span><b>" + n + "</b><small> di keranjang</small></span>" +
      '<button data-inc="' + esc(kode) + '" aria-label="Tambah">+</button></div>';
  }
  function cardHTML(p, extraClass) {
    return '<article class="card' + (extraClass ? " " + extraClass : "") + '">' +
      '<div class="card-img"><span class="ph">' + esc(initials(p.nama)) + "</span>" + imgHTML(p) +
      (extraClass ? '<span class="card-flag">Terlaris</span>' : "") + "</div>" +
      '<div class="card-body">' +
      '<span class="card-cat">' + esc(p.kategori) + "</span>" +
      '<h3 class="card-name">' + esc(p.nama) + "</h3>" +
      (p.deskripsi ? '<p class="card-desc">' + esc(p.deskripsi) + "</p>" : "") +
      '<div class="card-price">' + rupiah(p.harga) + "</div>" +
      '<div class="card-action" data-act="' + esc(p.kode) + '">' + actionHTML(p.kode) + "</div>" +
      "</div></article>";
  }
  function updateActions() {
    document.querySelectorAll("[data-act]").forEach(function (el) {
      el.innerHTML = actionHTML(el.getAttribute("data-act"));
    });
  }

  /* ---------- Produk unggulan (carousel) ---------- */
  function isFeatured(p) { return /^(ya|y|1|true)$/i.test(String(p.unggulan || "").trim()); }
  function renderFeatured() {
    var wrap = $("#featured"); if (!wrap) return;
    var list = products.filter(isFeatured);
    if (!list.length) { wrap.classList.add("hidden"); return; }
    wrap.classList.remove("hidden");
    var track = $("#featuredTrack");
    track.innerHTML = list.map(function (p) { return cardHTML(p, "card-feat"); }).join("");
    track.scrollLeft = 0;
    updateFeaturedNav();
  }
  function featuredPages() {
    var t = $("#featuredTrack");
    return { page: Math.round(t.scrollLeft / t.clientWidth), total: Math.max(1, Math.ceil((t.scrollWidth - 4) / t.clientWidth)) };
  }
  function updateFeaturedNav() {
    var t = $("#featuredTrack"); if (!t) return;
    var s = featuredPages();
    var dots = "";
    for (var i = 0; i < s.total; i++) dots += '<button class="' + (i === s.page ? "on" : "") + '" data-fpage="' + i + '" aria-label="Halaman ' + (i + 1) + '"></button>';
    $("#featuredDots").innerHTML = s.total > 1 ? dots : "";
    $("#featPrev").disabled = t.scrollLeft <= 2;
    $("#featNext").disabled = t.scrollLeft + t.clientWidth >= t.scrollWidth - 2;
  }
  function scrollFeatured(dir) {
    var t = $("#featuredTrack");
    t.scrollBy({ left: dir * t.clientWidth, behavior: "smooth" });
  }

  /* ---------- Grid semua produk ---------- */
  var PAGE_SIZE = 12, shown = PAGE_SIZE;
  function renderProducts() {
    var q = query.toLowerCase();
    var list = products.filter(function (p) {
      return (activeCat === "Semua" || p.kategori === activeCat) &&
        (!q || (p.nama + " " + p.deskripsi + " " + p.kode).toLowerCase().indexOf(q) >= 0);
    });
    var more = $("#loadWrap");
    $("#resultInfo").textContent = list.length ? list.length + " produk" + (activeCat !== "Semua" ? " di " + activeCat : "") : "";
    if (!list.length) {
      $("#productGrid").innerHTML = '<p class="muted center grid-empty">Produk tidak ditemukan.</p>';
      more.classList.add("hidden");
      return;
    }
    $("#productGrid").innerHTML = list.slice(0, shown).map(function (p) { return cardHTML(p); }).join("");
    var rest = list.length - shown;
    more.classList.toggle("hidden", rest <= 0);
    $("#loadInfo").textContent = "Menampilkan " + Math.min(shown, list.length) + " dari " + list.length + " produk";
    $("#loadMore").textContent = "Muat " + Math.min(PAGE_SIZE, rest) + " lagi";
    $("#showAll").textContent = "Tampilkan semua (" + list.length + ")";
  }

  /* ---------- Keranjang ---------- */
  function cartCount() { return Object.keys(cart).reduce(function (s, k) { return s + cart[k]; }, 0); }
  function cartTotal() {
    return Object.keys(cart).reduce(function (s, k) { var p = findP(k); return s + (p ? p.harga * cart[k] : 0); }, 0);
  }

  /* ---------- Promo ---------- */
  var PR = C.promos || {};
  var FS = PR.freeShipping && PR.freeShipping.active ? PR.freeShipping : null;
  var DC = PR.discount && PR.discount.active ? PR.discount : null;
  function shortRp(n) { return n >= 1000 ? "Rp" + (n / 1000).toLocaleString("id-ID") + "rb" : rupiah(n); }
  function isFreeArea(text) {
    if (!FS) return false;
    var t = String(text || "").toLowerCase();
    return (FS.areas || []).some(function (a) { return t.indexOf(a) >= 0; });
  }
  // Hitung semua angka promo dari subtotal (sebelum diskon) dan alamat
  function calc(areaText) {
    var sub = cartTotal();
    var disc = DC && sub >= DC.minPurchase ? Math.round(sub * DC.percent / 100) : 0;
    var shipEligible = !!FS && sub >= FS.minPurchase;
    return {
      subtotal: sub,
      discount: disc,
      total: sub - disc,
      shipEligible: shipEligible,
      freeShip: shipEligible && areaText !== undefined && isFreeArea(areaText)
    };
  }
  function renderPromos() {
    var cards = [];
    if (FS) cards.push({
      icon: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>',
      title: FS.title,
      desc: "Untuk alamat Jakarta, Bogor, Depok, Tangerang, dan Bekasi.",
      term: "Min. belanja " + rupiah(FS.minPurchase)
    });
    if (DC) cards.push({
      icon: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>',
      title: DC.title,
      desc: "Potongan " + DC.percent + "% dari total harga barang, otomatis dihitung di keranjang.",
      term: "Min. belanja " + rupiah(DC.minPurchase)
    });
    var sec = $("#promo");
    if (!cards.length) { if (sec) sec.classList.add("hidden"); return; }
    $("#promoGrid").innerHTML = cards.map(function (c, i) {
      return '<div class="promo-card' + (i === 1 ? " alt" : "") + '"><div class="promo-icon">' + c.icon + "</div>" +
        '<div class="promo-text"><h3>' + esc(c.title) + "</h3><p>" + esc(c.desc) + "</p>" +
        '<span class="promo-term">' + esc(c.term) + "</span></div></div>";
    }).join("");
    var bar = $("#promoBar");
    if (bar) {
      // Teks berjalan: isi diulang supaya selalu memenuhi layar, lalu digandakan agar putarannya mulus
      var items = cards.map(function (c) {
        return "<span>" + esc(c.title) + " · " + esc(c.term.replace("Min. belanja ", "min. ")) + "</span>";
      }).concat(["<span>Bayar di tempat (COD) · Dikirim JNE</span>"]);
      var group = "";
      for (var r = 0; r < 3; r++) group += items.map(function (t) { return t + '<i aria-hidden="true">•</i>'; }).join("");
      bar.innerHTML = '<p class="sr-only">' + cards.map(function (c) { return esc(c.title) + ", " + esc(c.term); }).join(". ") + ".</p>" +
        '<div class="promo-track" aria-hidden="true"><div class="promo-group">' + group + '</div><div class="promo-group">' + group + "</div></div>";
      bar.classList.remove("hidden");
      document.body.classList.add("has-promo-bar");
    }
  }
  function promoHint(c) {
    if (!c.subtotal) return "";
    if (FS && c.subtotal < FS.minPurchase) return "Tambah " + rupiah(FS.minPurchase - c.subtotal) + " lagi untuk gratis ongkir Jabodetabek.";
    if (DC && c.subtotal < DC.minPurchase) return "Tambah " + rupiah(DC.minPurchase - c.subtotal) + " lagi untuk diskon " + DC.percent + "%.";
    if (DC) return "Diskon " + DC.percent + "% sudah diterapkan.";
    return "";
  }
  function updateShipStatus() {
    var box = $("#shipStatus"); if (!box || !FS) return;
    var f = $("#stepCheckout");
    var area = f.kota.value + " " + f.kecamatan.value;
    var c = calc(area);
    if (!f.kota.value.trim()) { box.classList.add("hidden"); return; }
    box.classList.remove("hidden", "ok");
    if (c.freeShip) { box.classList.add("ok"); box.textContent = "✔ Alamat Jabodetabek: ongkir GRATIS."; }
    else if (isFreeArea(area)) box.textContent = "Alamat Jabodetabek. Tambah " + rupiah(FS.minPurchase - c.subtotal) + " lagi untuk gratis ongkir.";
    else box.textContent = "Di luar Jabodetabek: ongkir JNE dikonfirmasi admin.";
  }
  function addToCart(kode) {
    var p = findP(kode); if (!p) return;
    cart[kode] = (cart[kode] || 0) + 1; saveCart(); renderCart();
    toast(p.nama + " masuk keranjang");
    track("AddToCart", { content_ids: [kode], content_name: p.nama, value: p.harga, currency: "IDR" });
  }
  function changeQty(kode, d) {
    cart[kode] = (cart[kode] || 0) + d;
    if (cart[kode] <= 0) delete cart[kode];
    saveCart(); renderCart();
  }
  function renderCart() {
    $("#cartBadge").textContent = cartCount();
    var keys = Object.keys(cart);
    $("#cartItems").innerHTML = keys.length ? keys.map(function (k) {
      var p = findP(k); if (!p) return "";
      return '<div class="cart-item">' +
        '<div class="thumb">' + (p.foto ? imgHTML(p) : esc(initials(p.nama))) + "</div>" +
        '<div class="info"><div class="name">' + esc(p.nama) + "</div>" +
        '<div class="price">' + rupiah(p.harga) + " × " + cart[k] + " = <b>" + rupiah(p.harga * cart[k]) + "</b></div>" +
        '<div class="qty"><button data-dec="' + esc(k) + '" aria-label="Kurangi">−</button><span>' + cart[k] +
        '</span><button data-inc="' + esc(k) + '" aria-label="Tambah">+</button>' +
        '<button class="remove" data-del="' + esc(k) + '">Hapus</button></div></div></div>';
    }).join("") : '<p class="empty">Keranjang masih kosong.</p>';
    var c = calc();
    $("#cartSubtotal").textContent = rupiah(c.subtotal);
    $("#cartDiscountRow").classList.toggle("hidden", !c.discount);
    if (DC) $("#cartDiscountLabel").textContent = "Diskon " + DC.percent + "%";
    $("#cartDiscount").textContent = "−" + rupiah(c.discount);
    $("#cartTotal").textContent = rupiah(c.total);
    $("#cartShip").textContent = c.shipEligible ? "Gratis untuk Jabodetabek" : "Dikonfirmasi admin";
    $("#cartShip").classList.toggle("ok", c.shipEligible);
    var hint = promoHint(c), h = $("#promoHint");
    h.textContent = hint; h.classList.toggle("hidden", !hint);
    h.classList.toggle("ok", !!c.discount);
    var pb = $("#promoProgress");
    if (pb && DC) {
      pb.classList.toggle("hidden", !c.subtotal);
      pb.firstElementChild.style.width = Math.min(100, Math.round(c.subtotal / DC.minPurchase * 100)) + "%";
    }
    $("#toCheckout").disabled = !keys.length;
    updateShipStatus();
    updateActions();
  }

  /* ---------- Drawer ---------- */
  function showStep(id) {
    ["#stepCart", "#stepCheckout", "#stepDone"].forEach(function (s) { $(s).classList.toggle("hidden", s !== id); });
    $("#drawerTitle").textContent = id === "#stepCheckout" ? "Data Pengiriman" : id === "#stepDone" ? "Terima Kasih" : "Keranjang";
  }
  function openDrawer() {
    showStep("#stepCart");
    $("#drawer").classList.add("open"); $("#overlay").classList.add("show");
    $("#drawer").setAttribute("aria-hidden", "false");
  }
  function closeDrawer() {
    $("#drawer").classList.remove("open"); $("#overlay").classList.remove("show");
    $("#drawer").setAttribute("aria-hidden", "true");
  }

  /* ---------- Checkout ke WhatsApp ---------- */
  function normPhone(v) {
    v = String(v).replace(/[^\d]/g, "");
    if (v.indexOf("0") === 0) v = "62" + v.slice(1);
    if (v.indexOf("8") === 0) v = "62" + v;
    return v;
  }
  function buildMessage(d) {
    var lines = ["*PESANAN BARU - " + (C.storeName || "Hanifah Store") + "*", ""];
    lines.push("*Data Pembeli*");
    lines.push("Nama: " + d.nama);
    lines.push("No. WA: " + d.wa);
    lines.push("Alamat: " + d.alamat);
    lines.push("Kec. " + d.kecamatan + ", " + d.kota + " " + d.kodepos);
    lines.push("", "*Pesanan*");
    var i = 1;
    Object.keys(cart).forEach(function (k) {
      var p = findP(k); if (!p) return;
      lines.push(i++ + ". [" + p.kode + "] " + p.nama + " x" + cart[k] + " = " + rupiah(p.harga * cart[k]));
    });
    var c = calc(d.kota + " " + d.kecamatan);
    lines.push("", "Subtotal: " + rupiah(c.subtotal));
    if (c.discount) lines.push("Diskon " + DC.percent + "%: -" + rupiah(c.discount));
    lines.push("Total barang: *" + rupiah(c.total) + "*");
    if (c.freeShip) lines.push("Ongkir JNE: *GRATIS* (promo " + FS.title + ")");
    else lines.push("Ongkir JNE: menunggu konfirmasi admin");
    lines.push("Pembayaran: *COD (bayar di tempat)*");
    if (d.catatan) lines.push("", "Catatan: " + d.catatan);
    lines.push("", "Mohon konfirmasi total pembayarannya. Terima kasih.");
    return lines.join("\n");
  }
  function submitOrder(e) {
    e.preventDefault();
    var f = e.target, d = {};
    ["nama", "wa", "alamat", "kecamatan", "kota", "kodepos", "catatan"].forEach(function (n) { d[n] = f[n].value.trim(); });
    var err = "";
    if (!d.nama || !d.alamat || !d.kecamatan || !d.kota) err = "Mohon lengkapi semua kolom bertanda *.";
    else if (!/^628\d{7,11}$/.test(normPhone(d.wa))) err = "Nomor WhatsApp tidak valid. Contoh: 081234567890";
    else if (!/^\d{5}$/.test(d.kodepos)) err = "Kode pos harus 5 angka.";
    var box = $("#formError");
    if (err) { box.textContent = err; box.classList.remove("hidden"); return; }
    box.classList.add("hidden");
    d.wa = normPhone(d.wa);

    lastWaUrl = "https://wa.me/" + C.waNumber + "?text=" + encodeURIComponent(buildMessage(d));
    track("Purchase", { value: calc().total, currency: "IDR", num_items: cartCount() });
    window.open(lastWaUrl, "_blank");

    $("#retryWa").href = lastWaUrl;
    cart = {}; saveCart(); renderCart(); f.reset();
    showStep("#stepDone");
  }

  /* ---------- Meta Pixel ---------- */
  function initPixel(id) {
    if (!id) return;
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    }(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
    window.fbq("init", id); window.fbq("track", "PageView");
  }

  /* ---------- Inisialisasi ---------- */
  function init() {
    if (C.brandColor) document.documentElement.style.setProperty("--brand", C.brandColor);
    document.querySelectorAll("[data-store-name]").forEach(function (el) { el.textContent = C.storeName || el.textContent; });
    if (C.tagline && $("[data-tagline]")) $("[data-tagline]").textContent = C.tagline;
    var waLink = "https://wa.me/" + C.waNumber + "?text=" + encodeURIComponent("Assalamu'alaikum, saya ingin bertanya tentang produk " + (C.storeName || ""));
    $("#footerWa").href = waLink; $("#floatWa").href = waLink;
    initPixel(C.metaPixelId);

    document.addEventListener("click", function (e) {
      var t = e.target.closest("[data-add],[data-inc],[data-dec],[data-del],[data-cat],[data-fpage]");
      if (!t) return;
      if (t.dataset.add) addToCart(t.dataset.add);
      else if (t.dataset.inc) changeQty(t.dataset.inc, 1);
      else if (t.dataset.dec) changeQty(t.dataset.dec, -1);
      else if (t.dataset.del) { delete cart[t.dataset.del]; saveCart(); renderCart(); }
      else if (t.dataset.cat) { activeCat = t.dataset.cat; shown = PAGE_SIZE; renderCategories(); renderProducts(); }
      else if (t.dataset.fpage) { var tr = $("#featuredTrack"); tr.scrollTo({ left: Number(t.dataset.fpage) * tr.clientWidth, behavior: "smooth" }); }
    });
    $("#search").addEventListener("input", function (e) { query = e.target.value; shown = PAGE_SIZE; renderProducts(); });
    $("#loadMore").addEventListener("click", function () { shown += PAGE_SIZE; renderProducts(); });
    $("#showAll").addEventListener("click", function () { shown = Infinity; renderProducts(); });
    $("#featPrev").addEventListener("click", function () { scrollFeatured(-1); });
    $("#featNext").addEventListener("click", function () { scrollFeatured(1); });
    var navT;
    $("#featuredTrack").addEventListener("scroll", function () { clearTimeout(navT); navT = setTimeout(updateFeaturedNav, 60); }, { passive: true });
    window.addEventListener("resize", function () { clearTimeout(navT); navT = setTimeout(updateFeaturedNav, 150); });
    $("#openCart").addEventListener("click", openDrawer);
    $("#closeCart").addEventListener("click", closeDrawer);
    $("#overlay").addEventListener("click", closeDrawer);
    $("#doneClose").addEventListener("click", closeDrawer);
    $("#toCheckout").addEventListener("click", function () {
      showStep("#stepCheckout");
      track("InitiateCheckout", { value: cartTotal(), currency: "IDR", num_items: cartCount() });
    });
    $("#backToCart").addEventListener("click", function () { showStep("#stepCart"); });
    $("#stepCheckout").addEventListener("submit", submitOrder);
    $("#stepCheckout").kota.addEventListener("input", updateShipStatus);
    $("#stepCheckout").kecamatan.addEventListener("input", updateShipStatus);
    renderPromos();
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeDrawer(); });

    renderCart();
    loadProducts();
  }
  document.addEventListener("DOMContentLoaded", init);
})();
