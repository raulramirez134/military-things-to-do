// Exchange-rate and on-post gas price boxes for base pages.
// Usage: <section id="moneySection" data-base="ramstein" data-currencies="EUR,GBP,..."> with
// #ratesCard and #gasCard inside. Each card stays hidden until it has real data, and the whole
// section stays hidden if neither does — a broken source never leaves an empty box on the page.
(function () {
  var section = document.getElementById("moneySection");
  if (!section) return;
  var base = section.getAttribute("data-base") || "";
  var wanted = (section.getAttribute("data-currencies") || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
  var ratesCard = document.getElementById("ratesCard");
  var gasCard = document.getElementById("gasCard");
  var ratesSource = section.getAttribute("data-rates") || (wanted.length ? "scu" : "");
  var local = null; // { symbol, rate, decimals } — for the local-currency column in the gas box
  var gasData = null;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function show(el) { if (el) el.hidden = false; section.hidden = false; var l = document.getElementById("moneyNavLink"); if (l) l.hidden = false; }
  function fmtDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!m) return iso || "";
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return parseInt(m[3], 10) + " " + months[parseInt(m[2], 10) - 1] + " " + m[1];
  }
  function fmtUsDate(us) { // "11/18/2026" -> "18 Nov 2026"
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(us || "");
    return m ? fmtDate(m[3] + "-" + ("0" + m[1]).slice(-2) + "-" + ("0" + m[2]).slice(-2)) : (us || "");
  }

  function renderGas() {
    if (!gasCard || !gasData || !gasData.prices || !gasData.prices.length) return;
    var euroCol = local ? '<th class="m-num">' + local.symbol + ' / liter</th>' : "";
    var rows = gasData.prices.map(function (p) {
      return "<tr><td>" + esc(p.type) + '</td><td class="m-num">$' + Number(p.gallon).toFixed(3) +
        '</td><td class="m-num">$' + Number(p.liter).toFixed(3) + "</td>" +
        (local ? '<td class="m-num m-dim">≈ ' + local.symbol + (p.liter * local.rate).toLocaleString("en-US", { minimumFractionDigits: local.decimals, maximumFractionDigits: local.decimals }) + "</td>" : "") + "</tr>";
    }).join("");
    gasCard.innerHTML =
      '<div class="m-head">Gas Prices on Post</div>' +
      '<div class="m-sub">Exchange Express stations' + (gasData.region ? " · " + esc(gasData.region) : "") + "</div>" +
      '<div class="m-date">Prices as of ' + esc(fmtDate(gasData.asOf)) + "</div>" +
      '<table class="m-table"><thead><tr><th>Fuel</th><th class="m-num">Per gallon</th><th class="m-num">Per liter</th>' + euroCol + "</tr></thead><tbody>" + rows + "</tbody></table>" +
      '<p class="m-note">' + (base === "ramstein"
        ? "Paid in U.S. dollars with your Exchange ESSO fuel ration card. Prices change with the market — check the pump sign."
        : "Prices change with the market — check the pump sign.") +
      (local ? " " + local.note : "") + "</p>";
    show(gasCard);
  }

  function renderCommunityBank(data) {
    var r = data.rates[0];
    if (!r || !(r.rate > 0)) return;
    var sym = esc(r.symbol || ""), fmt = function (n) { return Number(n).toLocaleString("en-US"); };
    local = { symbol: r.symbol || "", rate: r.rate, decimals: 0, note: "Local-currency figures use today's Community Bank rate." };
    var rows = '<tr><td>Buying ' + esc(r.name.split(" ").pop().toLowerCase()) + ' with dollars</td><td class="m-num">$1 = ' + sym + fmt(r.rate) + "</td></tr>" +
      (r.reconversion ? '<tr><td>Selling it back for dollars</td><td class="m-num">' + sym + fmt(r.reconversion) + " = $1</td></tr>" : "") +
      '<tr><td>' + sym + '1,000 costs about</td><td class="m-num">$' + (1000 / r.rate).toFixed(2) + "</td></tr>";
    ratesCard.innerHTML =
      '<div class="m-head">Exchange Rate</div>' +
      '<div class="m-sub">Community Bank · on-base rate in ' + esc(data.country || "") + "</div>" +
      '<div class="m-date">' + (data.validFrom ? "Effective " + esc(fmtDate(data.validFrom)) : "") + "</div>" +
      '<div class="m-big">$1 USD buys <b>' + sym + fmt(r.rate) + "</b></div>" +
      '<table class="m-table"><tbody>' + rows + "</tbody></table>" +
      '<p class="m-note">Rates courtesy of <a href="' + esc(data.sourceUrl) + '" target="_blank" rel="noopener">Community Bank</a>, the on-base bank, for its banking centers and ATMs in ' + esc(data.country || "country") + ". Off-base banks and exchange counters set their own rates; ask your banking center about buy-back limits.</p>";
    show(ratesCard);
    renderGas();
  }

  function renderRates(data) {
    if (!ratesCard || !data || !data.rates || !data.rates.length) return;
    if (data.source === "Community Bank") return renderCommunityBank(data);
    var byCode = {};
    data.rates.forEach(function (r) { byCode[r.code] = r; });
    var list = (wanted.length ? wanted : data.rates.map(function (r) { return r.code; }))
      .map(function (c) { return byCode[c]; }).filter(Boolean);
    if (!list.length) return;
    if (byCode.EUR) local = { symbol: "€", rate: byCode.EUR.rate, decimals: 2, note: "Euro figures use today's Service CU rate." };
    var rows = list.map(function (r) {
      var arrow = r.change === "up" ? '<span class="m-up" title="Up since the last rate">▲</span>' :
        r.change === "down" ? '<span class="m-down" title="Down since the last rate">▼</span>' : "";
      return "<tr><td>" + esc(r.name) + ' <span class="m-code">' + esc(r.code) + '</span></td><td class="m-num">' +
        Number(r.rate).toFixed(4) + " " + arrow + "</td></tr>";
    }).join("");
    var eur = byCode.EUR;
    ratesCard.innerHTML =
      '<div class="m-head">Exchange Rates</div>' +
      '<div class="m-sub">Service Credit Union · military accommodation rate</div>' +
      '<div class="m-date">' + (data.updated ? "Last updated " + esc(fmtUsDate(data.updated)) : "") + "</div>" +
      '<div class="m-buys">$1 USD buys…</div>' +
      '<table class="m-table"><tbody>' + rows + "</tbody></table>" +
      (eur ? '<p class="m-note">€1 costs about $' + (1 / eur.rate).toFixed(4) +
        (eur.reconversion ? " · selling euros back: $1 = €" + Number(eur.reconversion).toFixed(4) : "") + ".</p>" : "") +
      '<p class="m-note">Rates courtesy of <a href="' + esc(data.sourceUrl) + '" target="_blank" rel="noopener">Service Credit Union</a>; updated each business day. Other banks and on-post exchange counters may differ.</p>';
    show(ratesCard);
    renderGas(); // re-render gas so it can add the euro column
  }

  if (ratesCard && ratesSource) {
    fetch("/api/rates?source=" + encodeURIComponent(ratesSource)).then(function (r) { return r.ok ? r.json() : null; }).then(renderRates).catch(function () {});
  }
  if (gasCard && base) {
    fetch("/api/gas?base=" + encodeURIComponent(base)).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { gasData = d; renderGas(); }).catch(function () {});
  }
})();
