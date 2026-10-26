// Printable "deal + notes" sheet: one two-column table (compact diagram | notes) per
// group of boards. Opened in a new window and handed to the browser's print dialog,
// where the user saves it as PDF.

const SYM = { S: '♠', H: '♥', D: '♦', C: '♣', NT: 'NT', N: 'NT' };
const CLR = { S: '#111', H: '#c62828', D: '#c62828', C: '#111', NT: '#111', N: '#111' };
const SUITS = [['S', 'spades'], ['H', 'hearts'], ['D', 'diamonds'], ['C', 'clubs']];
const NEXT_SEAT = { N: 'E', E: 'S', S: 'W', W: 'N' };

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const suit = s => `<span style="color:${CLR[s]}">${SYM[s]}</span>`;
const cards = c => String(c || '').replace(/T/g, '10');

function isVul(vul, seat) {
  const v = String(vul || '').toLowerCase();
  return v === 'both' || v === 'all' || (v === 'ns' && 'NS'.includes(seat)) || (v === 'ew' && 'EW'.includes(seat));
}

// The opening lead is shown on the table, so it is taken out of the leader's hand,
// as in the app's deal viewer.
function handHtml(deal, seat, lead) {
  const { board } = deal;
  const rows = SUITS.map(([s, key]) => {
    let holding = String(board[`${seat.toLowerCase()}_${key}`] || '').toUpperCase().replace(/10/g, 'T');
    if (lead?.seat === seat && lead.suit === s) holding = holding.replace(lead.rank, '');
    return `<div>${suit(s)} ${cards(holding) || '<span class="dash">—</span>'}</div>`;
  }).join('');
  const bg = isVul(board.vulnerability, seat) ? '#d32f2f' : '#2e7d32';
  const dealer = String(board.dealer).toUpperCase() === seat ? '<span class="dlr">D</span>' : '';
  return `<div class="hand"><div class="tag" style="background:${bg}">${dealer}${esc(deal.names[seat])}</div><div class="cards">${rows}</div></div>`;
}

function leadOf(result) {
  const raw = result?.lead || (result?.lead_suit && result?.lead_rank ? `${result.lead_suit}${result.lead_rank}` : '');
  const m = String(raw).toUpperCase().match(/^([SHDC])(10|[2-9TJQKA])$/);
  const declarer = String(result?.declarer || '').toUpperCase();
  if (!m || !NEXT_SEAT[declarer]) return null;
  return { seat: NEXT_SEAT[declarer], suit: m[1], rank: m[2] === '10' ? 'T' : m[2] };
}

function resultHtml(deal) {
  const { result, summary } = deal;
  if (!result) return '<div></div>';
  const denom = String(result.contract_denom || '').toUpperCase();
  const contract = result.passed_out
    ? '<b>Passed out</b>'
    : `<b>${result.contract_level}${SYM[denom] ? suit(denom) : esc(denom)}${esc(result.contract_x || '')}</b> <span class="mut">by ${esc(result.declarer)}</span> <b>${esc(summary.resultStr)}</b>`;
  let extra = '';
  if (summary.boardImps != null) {
    const n = Number(summary.boardImps);
    extra = ` <b style="color:${n > 0 ? '#15803d' : n < 0 ? '#c62828' : '#6b7280'}">(IMPs = ${n > 0 ? '+' : ''}${n})</b>`;
  } else if (summary.mpPct != null) {
    extra = ` <b style="color:${summary.mpPct >= 60 ? '#15803d' : summary.mpPct <= 40 ? '#c62828' : '#6b7280'}">(MP% = ${summary.mpPct})</b>`;
  }
  return `<div class="res">${contract}<br><span class="mut">Score:</span> <b>${esc(summary.scoreStr)}</b>${extra}</div>`;
}

function diagramHtml(deal) {
  const lead = leadOf(deal.result);
  const leadHtml = lead ? `<div class="lead lead-${lead.seat}" style="color:${CLR[lead.suit]}">${SYM[lead.suit]}${cards(lead.rank)}</div>` : '';
  return `<div class="grid">
    <div></div>${handHtml(deal, 'N', lead)}<div></div>
    ${handHtml(deal, 'W', lead)}<div class="mid">${leadHtml}</div>${handHtml(deal, 'E', lead)}
    ${resultHtml(deal)}${handHtml(deal, 'S', lead)}<div></div>
  </div>`;
}

const STYLE = `
@page{size:A4;margin:10mm}
*{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:-apple-system,Helvetica,Arial,sans-serif;margin:8px;background:#fff;color:#111}
@media print{body{zoom:1.75;margin:0}}
section+section{break-before:page}
h1{font-family:Calibri,Carlito,sans-serif;font-size:9px;margin:0 0 3px}
table{border-collapse:collapse;width:400px;table-layout:fixed}
tr{break-inside:avoid}
td{border:1px solid #bbb;vertical-align:top;padding:4px}
th{border:1px solid #bbb;background:#f1f5f9;font-family:Calibri,Carlito,sans-serif;font-size:7px;padding:1px 4px;text-align:left}
.grid{display:grid;grid-template-columns:auto auto auto;gap:1px 2px;font-size:6px;justify-content:start}
.hand{width:47px}
.tag{color:#fff;font-weight:700;font-size:5px;line-height:7px;text-align:center;border-radius:2px;padding:0 1px;white-space:nowrap;overflow:hidden}
.dlr{display:inline-block;background:#fff;color:#111;border-radius:50%;width:5px;height:5px;line-height:5px;font-size:4px;margin-right:1px;vertical-align:0.5px}
.cards{border:1px solid #e5e7eb;border-radius:2px;padding:0 2px;margin-top:1px;font-family:ui-monospace,Menlo,monospace;font-size:6px;line-height:1.2;white-space:nowrap}
.dash{color:#ccc}
.mid{position:relative}
.lead{position:absolute;font-weight:700;font-size:6.5px}
.lead-N{top:0;left:50%;transform:translateX(-50%)}
.lead-S{bottom:0;left:50%;transform:translateX(-50%)}
.lead-W{left:0;top:50%;transform:translateY(-50%)}
.lead-E{right:0;top:50%;transform:translateY(-50%)}
.res{align-self:end;border:1px solid #e5e7eb;border-radius:2px;padding:1px 2px;font-size:5px;line-height:1.3;width:34px}
.mut{color:#6b7280}
.note{font-family:Calibri,Carlito,sans-serif;font-size:7.5px;line-height:1.3;white-space:pre-wrap}
.note+.note{border-top:1px dotted #ccc;margin-top:3px;padding-top:3px}
`;

// groups: [{ heading, deals: [{ board, result, names, summary, notes: string[] }] }]
export function buildDealSheetHtml(title, groups) {
  const sections = groups.map(g => `<section><h1>${esc(g.heading)}</h1>
<table><tr><th style="width:155px">Deal</th><th>Notes</th></tr>${g.deals.map(d =>
    `<tr><td>${diagramHtml(d)}</td><td>${d.notes.map(n => `<div class="note">${esc(n)}</div>`).join('')}</td></tr>`).join('')}</table></section>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${STYLE}</style></head><body>${sections}</body></html>`;
}

// Writes the sheet into an already-open window and prints it. The print dialog uses
// the document title as the default PDF file name.
export function printDealSheet(w, title, groups) {
  w.document.open();
  w.document.write(buildDealSheetHtml(title, groups));
  w.document.close();
  w.document.fonts.ready.then(() => { w.focus(); w.print(); });
}
