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
        renderCategories(); renderProducts(); renderCart();
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
  function renderProducts() {
    var q = query.toLowerCase();
    var list = products.filter(function (p) {
      return (activeCat === "Semua" || p.kategori === activeCat) &&
        (!q || (p.nama + " " + p.deskripsi + " " + p.kode).toLowerCase().indexOf(q) >= 0);
    });
    if (!list.length) { $("#productGrid").innerHTML = '<p class="muted center">Produk tidak ditemukan.</p>'; return; }
    $("#productGrid").innerHTML = list.map(function (p) {
      return '<article class="card">' +
        '<div class="card-img"><span class="ph">' + esc(initials(p.nama)) + "</span>" + imgHTML(p) + "</div>" +
        '<div class="card-body">' +
        '<span class="card-cat">' + esc(p.kategori) + "</span>" +
        '<h3 class="card-name">' + esc(p.nama) + "</h3>" +
        (p.deskripsi ? '<p class="card-desc">' + esc(p.deskripsi) + "</p>" : "") +
        '<div class="card-price">' + rupiah(p.harga) + "</div>" +
        '<button class="btn btn-primary" data-add="' + esc(p.kode) + '">+ Keranjang</button>' +
        "</div></article>";
    }).join("");
  }

  /* ---------- Keranjang ---------- */
  function cartCount() { return Object.keys(cart).reduce(function (s, k) { return s + cart[k]; }, 0); }
  function cartTotal() {
    return Object.keys(cart).reduce(function (s, k) { var p = findP(k); return s + (p ? p.harga * cart[k] : 0); }, 0);
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
    $("#cartSubtotal").textContent = rupiah(cartTotal());
    $("#toCheckout").disabled = !keys.length;
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
    lines.push("", "Subtotal: *" + rupiah(cartTotal()) + "*");
    lines.push("Ongkir JNE: menunggu konfirmasi admin");
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
    track("Purchase", { value: cartTotal(), currency: "IDR", num_items: cartCount() });
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
    if (C.tagline) $("[data-tagline]").textContent = C.tagline;
    var waLink = "https://wa.me/" + C.waNumber + "?text=" + encodeURIComponent("Assalamu'alaikum, saya ingin bertanya tentang produk " + (C.storeName || ""));
    $("#footerWa").href = waLink; $("#floatWa").href = waLink;
    initPixel(C.metaPixelId);

    document.addEventListener("click", function (e) {
      var t = e.target.closest("[data-add],[data-inc],[data-dec],[data-del],[data-cat]");
      if (!t) return;
      if (t.dataset.add) addToCart(t.dataset.add);
      else if (t.dataset.inc) changeQty(t.dataset.inc, 1);
      else if (t.dataset.dec) changeQty(t.dataset.dec, -1);
      else if (t.dataset.del) { delete cart[t.dataset.del]; saveCart(); renderCart(); }
      else if (t.dataset.cat) { activeCat = t.dataset.cat; renderCategories(); renderProducts(); }
    });
    $("#search").addEventListener("input", function (e) { query = e.target.value; renderProducts(); });
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
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeDrawer(); });

    renderCart();
    loadProducts();
  }
  document.addEventListener("DOMContentLoaded", init);
})();
