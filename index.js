// Outils texte : ton appli d'origine (HTML et code inchangés), livrée en plugin.
// Ses données sont dans le dossier du plugin, que NeoBase sauvegarde (synchro cloud et sauvegardes) ; à la première ouverture elle reprend ce que tu avais dans NeoBase.
// Elle tourne dans le bac à sable de NeoBase, avec ses outils d'interface (ctx.host) et seulement les autorisations de son plugin.json.
const HTML = "";
/*CSS-MOVED*/ const CSS = `.txBody{display:flex;flex-direction:column;gap:14px}
.txCols{display:flex;gap:14px;align-items:stretch}
.txCols>*{flex:1;min-width:0}
.txArea{min-height:260px;resize:vertical;font-size:15px;line-height:1.5;padding:12px;user-select:text}
.txOut{overflow:auto;max-height:60vh}
.txDiff{width:100%;border-collapse:collapse;font:14px/1.45 Consolas,monospace;table-layout:fixed}
.txDiff th{width:44px;color:var(--muted);font-weight:normal;text-align:right;padding:0 8px;vertical-align:top;user-select:none}
.txDiff td{white-space:pre-wrap;word-break:break-word;padding:1px 8px;color:var(--shell);user-select:text}
.txDiff tr.del td:nth-child(2),.txDiff td.del{background:rgba(255,79,109,.16)}
.txDiff tr.ins td:nth-child(4),.txDiff td.ins{background:rgba(63,191,106,.16)}
.txDiff td.chg{background:rgba(240,160,48,.08)}
.txDiff td.none{background:rgba(255,255,255,.02)}
.txDiff mark.out{background:rgba(255,79,109,.45);color:#fff}
.txDiff mark.in{background:rgba(63,191,106,.45);color:#fff}
.txSide{display:flex;flex-direction:column;gap:14px}
.txLimits{display:flex;flex-direction:column;gap:6px;padding:4px 2px}
.txLim{display:flex;justify-content:space-between;color:var(--lilac)}
.txLim.over b{color:var(--red)}
.txSpellOut{display:flex;flex-direction:column;gap:8px;max-height:60vh;overflow:auto}
.txWord{flex-direction:row;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px}
.txWord .btn{padding:6px 10px;font-size:9px}
.txWord b.bad{color:var(--red);font-size:16px}
.txWord b.warn{color:#ffd07a;font-weight:normal}
.spMenu .spFix{font-weight:bold;color:#fff}
.spSug{display:flex;flex-direction:column}
.spSug>.hint{padding:6px 12px}
`;  // le style de ce plugin (il utilise les variables du thème de NeoBase)
export default async function (ctx) {
  const view = ctx.view;
  if (!ctx.host) { view.textContent = "Ce plugin doit être approuvé par NeoBase pour s'ouvrir."; return; }
  const host = ctx.host, { el, toast, sfx, ask, newTab, pixIcon, PIX, WX } = host;
  const folder = ctx.folder, legacy = ctx.legacy || {};
  ctx.host.addStyle(CSS);
  view.innerHTML = HTML;
  const $ = id => id === "textApp" ? view : (view.querySelector('#' + id) || document.getElementById(id));  // les identifiants de ta vue d'abord, puis ceux de la page (fenêtres, menus)
  const doc = async n => { try { return await folder.read(n); } catch { return null; } };
  const __icon = () => ctx.icon;  // l'icône de ce plugin
  const __picks = { "tools": d => ({ text: d.text }) };
  const __storeGet = async n => {
    let d = await doc(n);
    if (d == null) { try { d = await neo.storeGet(n); } catch { d = null; } if (d && __picks[n]) d = __picks[n](d); if (d != null) await folder.write(n, d); }  // première ouverture : tu retrouves ce que tu avais
    return d;
  };
  const __storeSet = async (n, d) => { await folder.write(n, d); return true; };
  // ---- ton code d'origine ----
let tools = null, toolsTimer = null;
const toolsReady = () => tools ? Promise.resolve(tools) : __storeGet('tools').then(d => tools = {text: {a: '', b: '', count: '', spell: '', ignore: []}, colors: {palettes: [], history: [], cur: '#e01ec8'}, gifs: {items: []}, ...(d || {})});
function toolsSave() { clearTimeout(toolsTimer); toolsTimer = setTimeout(() => { toolsTimer = null; __storeSet('tools', tools).catch(e => toast('Sauvegarde impossible : ' + e.message, true)); }, 600); }
addEventListener('pagehide', () => { if (toolsTimer) __storeSet('tools', tools); });
const toolCount = k => host.statCount(k);
const toolTabs = (box, tabs, cur, f) => { box.replaceChildren(...tabs.map(([k, l]) => { const b = el('button', 'tab px' + (k === cur ? ' on' : ''), l); b.onclick = () => f(k); return b; })); };

function barRow(name, pct, value, src, warn) {
  const r = el('div', 'sysRow'), n = el('div', 'tn'), bar = el('div', 'dlBar'), f = el('i', warn ? 'warn' : '');
  if (src) { const im = el('img'); im.onerror = () => im.remove(); im.src = src; n.append(im); }
  n.append(name); n.title = name; f.style.width = Math.max(1, pct) + '%'; bar.append(f);
  r.append(n, bar, el('span', 'v', value));
  return r;
}

/* ==================== Outils texte ==================== */
// differences between two lists (lines or words): longest common subsequence, the common start and end cut first
function diffOps(a, b) {
  let s = 0; while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let e = 0; while (e < a.length - s && e < b.length - s && a[a.length - 1 - e] === b[b.length - 1 - e]) e++;
  const A = a.slice(s, a.length - e), B = b.slice(s, b.length - e), n = A.length, m = B.length, ops = [];
  for (let i = 0; i < s; i++) ops.push(['=', i, i]);
  if (n * m > 6e6) { A.forEach((_, i) => ops.push(['-', s + i])); B.forEach((_, j) => ops.push(['+', null, s + j])); }  // shortcut: huge texts are shown as fully replaced past the common parts
  else {
    const L = new Uint32Array((n + 1) * (m + 1)), at = (i, j) => i * (m + 1) + j;
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[at(i, j)] = A[i] === B[j] ? L[at(i + 1, j + 1)] + 1 : Math.max(L[at(i + 1, j)], L[at(i, j + 1)]);
    let i = 0, j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && A[i] === B[j]) { ops.push(['=', s + i, s + j]); i++; j++; }
      else if (j < m && (i === n || L[at(i, j + 1)] >= L[at(i + 1, j)])) { ops.push(['+', null, s + j]); j++; }
      else { ops.push(['-', s + i]); i++; }
    }
  }
  for (let i = 0; i < e; i++) ops.push(['=', a.length - e + i, b.length - e + i]);
  return ops;
}
{ const o = diffOps(['a', 'b', 'c'], ['a', 'x', 'c']).map(x => x[0]).join(''); console.assert(o === '=+-=' || o === '=-+=', 'diffOps ' + o); }
const txWords = s => s.match(/\s+|[\p{L}\p{N}_'’-]+|[^\s\p{L}\p{N}_]/gu) || [];
const TX_STOP = new Set('le la les de des du un une et en à au aux ce ces cette que qui quoi dans pour par sur avec sans ne pas plus est sont été être a ai as avons ont il elle ils elles on nous vous je tu me te se mon ma mes ton ta tes son sa ses leur leurs y d l j n s c qu the of and to in is it that for on as with was'.split(' '));
const tx = {mode: 'diff'};
function txMount() {
  const v = $('textApp'), w = el('div', 'appWrap wide'), head = el('div', 'agHead'), tabs = el('div', 'agNav'), body = el('div', 'txBody');
  head.append(el('span', 'label', 'Outils texte'), tabs); w.append(head, body); v.replaceChildren(w);
  Object.assign(tx, {tabs, body});
}
async function txOpen(mode = tx.mode) {
  await toolsReady(); tx.mode = mode;
  toolTabs(tx.tabs, [['diff', 'COMPARER'], ['count', 'COMPTER'], ['spell', 'ORTHOGRAPHE']], mode, m => txOpen(m));
  ({diff: txDiff, count: txCount, spell: txSpell})[mode]();
}
const txArea = (k, ph) => { const t = el('textarea', 'f txArea'); t.placeholder = ph; t.value = tools.text[k] || ''; t.spellcheck = k !== 'a' && k !== 'b'; t.oninput = () => { tools.text[k] = t.value; toolsSave(); }; return t; };
function txDiff() {
  const a = txArea('a', 'Texte d\'origine'), b = txArea('b', 'Texte modifié'), opts = el('div', 'row'), out = el('div', 'txOut'), info = el('span', 'hint');
  const chk = (k, l) => { const c = el('label', 'check'), i = el('input'); i.type = 'checkbox'; i.checked = !!tools.text[k]; i.onchange = () => { tools.text[k] = i.checked; toolsSave(); run(); }; c.append(i, ' ' + l); return c; };
  const swap = el('button', 'btn px', '⇄ INVERSER'); swap.onclick = () => { [tools.text.a, tools.text.b] = [tools.text.b, tools.text.a]; toolsSave(); txDiff(); };
  opts.append(chk('ic', 'Ignorer les majuscules'), chk('iw', 'Ignorer les espaces'), swap, info);
  const cols = el('div', 'txCols'); cols.append(a, b);
  tx.body.replaceChildren(cols, opts, out);
  const run = () => {
    const norm = s => { if (tools.text.ic) s = s.toLowerCase(); if (tools.text.iw) s = s.replace(/\s+/g, ' ').trim(); return s; };
    const la = a.value.split(/\r?\n/), lb = b.value.split(/\r?\n/), ops = diffOps(la.map(norm), lb.map(norm)), rows = [];
    let add = 0, del = 0;
    for (let k = 0; k < ops.length; k++) {  // a run of removed lines followed by added lines = modified lines, shown word by word
      if (ops[k][0] === '=') { rows.push(['same', ops[k][1], ops[k][2]]); continue; }
      const dels = [], adds = []; while (k < ops.length && ops[k][0] !== '=') { (ops[k][0] === '-' ? dels : adds).push(ops[k]); k++; } k--;
      del += dels.length; add += adds.length;
      for (let i = 0; i < Math.max(dels.length, adds.length); i++) rows.push([dels[i] && adds[i] ? 'chg' : dels[i] ? 'del' : 'ins', dels[i]?.[1], adds[i]?.[2]]);
    }
    const cell = (cls, n, text, other, side) => {
      const td = el('td', cls); if (text == null) return td;
      if (cls === 'chg') { const wa = txWords(text), wb = txWords(other), o = diffOps(wa.map(norm), wb.map(norm));
        for (const [t, i, j] of o) { if (t === '=') td.append(side === 'a' ? wa[i] : wb[j]); else if ((t === '-') === (side === 'a')) td.append(el('mark', side === 'a' ? 'out' : 'in', t === '-' ? wa[i] : wb[j])); } }
      else td.textContent = text || ' ';
      return td;
    };
    const table = el('table', 'txDiff');
    for (const [k, i, j] of rows) {
      if (k === 'same' && rows.length > 400) continue;  // long texts: only the changes
      const tr = el('tr', k);
      tr.append(el('th', '', i == null ? '' : String(i + 1)), cell(k === 'ins' ? 'none' : k, i, i == null ? null : la[i], j == null ? '' : lb[j], 'a'),
        el('th', '', j == null ? '' : String(j + 1)), cell(k === 'del' ? 'none' : k, j, j == null ? null : lb[j], i == null ? '' : la[i], 'b'));
      table.append(tr);
    }
    info.textContent = !a.value && !b.value ? 'Colle deux versions d\'un texte pour voir ce qui a changé.' : !add && !del ? 'Les deux textes sont identiques.' : `${del} ligne${del > 1 ? 's' : ''} retirée${del > 1 ? 's' : ''} ou modifiée${del > 1 ? 's' : ''} · ${add} ajoutée${add > 1 ? 's' : ''} ou modifiée${add > 1 ? 's' : ''}`;
    out.replaceChildren(a.value || b.value ? table : el('span'));
  };
  let t; a.addEventListener('input', () => { clearTimeout(t); t = setTimeout(run, 250); }); b.addEventListener('input', () => { clearTimeout(t); t = setTimeout(run, 250); });
  run(); if (a.value || b.value) toolCount('diffs');
}
function txCount() {
  const area = txArea('count', 'Écris ou colle un texte : tout est compté en direct.'), grid = el('div', 'sysGrid txStats'), freq = el('div', 'sysCard px'), lim = el('div', 'txLimits');
  const side = el('div', 'txSide'); side.append(freq, lim);
  const cols = el('div', 'txCols'); cols.append(area, side); tx.body.replaceChildren(grid, cols);
  const tile = (l, v, h) => { const c = el('div', 'sysCard px'); c.append(el('span', 'label', l), el('div', 'sysBig', v), el('div', 'hint', h || '')); return c; };
  const run = () => {
    const s = area.value, words = s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || [], n = words.length, sentences = (s.match(/[^.!?…]+[.!?…]+/g) || []).length + (/[^.!?…\s]\s*$/.test(s) ? 1 : 0);
    const paras = s.split(/\n\s*\n/).filter(p => p.trim()).length, uniq = new Set(words.map(w => w.toLowerCase())).size, longest = words.reduce((a, w) => w.length > a.length ? w : a, '');
    const mins = m => m < 1 ? Math.max(0, Math.round(m * 60)) + ' s' : Math.round(m) + ' min';
    grid.replaceChildren(tile('Mots', String(n)), tile('Caractères', String(s.length), (s.replace(/\s/g, '').length) + ' sans les espaces'), tile('Phrases', String(sentences), paras + ' paragraphe' + (paras > 1 ? 's' : '') + ' · ' + (s ? s.split('\n').length : 0) + ' lignes'),
      tile('Lecture', mins(n / 230), 'à voix haute : ' + mins(n / 150)), tile('Mots différents', String(uniq), longest ? 'le plus long : ' + longest : ''));
    const f = {}; for (const w of words) { const k = w.toLowerCase(); if (!TX_STOP.has(k) && k.length > 1) f[k] = (f[k] || 0) + 1; }
    const top = Object.entries(f).sort((a, b) => b[1] - a[1]).slice(0, 12);
    freq.replaceChildren(el('span', 'label', 'Mots les plus utilisés'), ...(top.length ? top.map(([w, c]) => barRow(w, c / top[0][1] * 100, c + ' × ' + (n ? '(' + (c / n * 100).toFixed(1).replace('.', ',') + ' %)' : ''), '')) : [el('div', 'hint', 'Les mots qui reviennent souvent apparaîtront ici (sans « le », « de », « et »…).')]));
    lim.replaceChildren(el('span', 'label', 'Limites'), ...[['Tweet / X', 280], ['SMS', 160], ['Titre SEO', 60], ['Description SEO', 155], ['Bio Instagram', 150]].map(([l, max]) => {
      const r = el('div', 'txLim' + (s.length > max ? ' over' : '')); r.append(el('span', '', l), el('b', '', s.length + ' / ' + max)); return r; }));
  };
  area.addEventListener('input', run); run(); area.focus();
}
function txSpell() {
  const area = txArea('spell', 'Colle ou écris un texte en français (ou en anglais), puis clique sur VÉRIFIER. Clic droit sur un mot : suggestions.'), go = el('button', 'btn main px', 'VÉRIFIER'), fixAll = el('button', 'btn px', 'TOUT CORRIGER'), out = el('div', 'txSpellOut'), info = el('span', 'hint');
  area.lang = 'fr'; area.spellcheck = false;
  const row = el('div', 'row'); row.append(go, fixAll, info);
  const cols = el('div', 'txCols'); cols.append(area, out); tx.body.replaceChildren(row, cols);
  const replace = (w, by) => { area.value = area.value.replace(new RegExp('(?<![\\p{L}\\p{N}])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\p{L}\\p{N}])', 'gu'), by); tools.text.spell = area.value; toolsSave(); check(); };
  let found = [];
  const check = async () => {
    const s = area.value; go.disabled = true; info.textContent = 'Vérification…';
    let errs = []; try { errs = await spellList(s); } catch (e) { toast('Correcteur indisponible : ' + e.message.replace(/^.*Error: /, ''), true); } finally { go.disabled = false; }
    if (area.value !== s) return;  // the text changed meanwhile
    const by = new Map(); for (const x of errs) if (!by.has(x.w)) by.set(x.w, x.s); found = [...by.keys()];
    // French typography and repeated words
    const typo = [];
    if (/ {2,}/.test(s)) typo.push(['Espaces en double', () => { area.value = area.value.replace(/ {2,}/g, ' '); tools.text.spell = area.value; toolsSave(); check(); }]);
    if (/\S[!?;:»]/.test(s.replace(/https?:\/\/\S+/g, '').replace(/\d:\d/g, ''))) typo.push(['Espace manquante avant ! ? ; : (règle française)', () => { area.value = area.value.replace(/(\S)([!?;»])/g, (m, a, b) => /[!?;\s]/.test(a) ? m : a + ' ' + b); tools.text.spell = area.value; toolsSave(); check(); }]);
    if (/\s[,.]/.test(s)) typo.push(['Espace avant une virgule ou un point', () => { area.value = area.value.replace(/[ \t]+([,.])/g, '$1'); tools.text.spell = area.value; toolsSave(); check(); }]);
    const rep = [...s.matchAll(/(?<![\p{L}])([\p{L}]+)\s+\1(?![\p{L}])/giu)].map(m => m[0]);
    if (rep.length) typo.push(['Mot répété : « ' + rep[0] + ' »' + (rep.length > 1 ? ' et ' + (rep.length - 1) + ' autre' + (rep.length > 2 ? 's' : '') : ''), () => { area.value = area.value.replace(/(?<![\p{L}])([\p{L}]+)(\s+\1)+(?![\p{L}])/giu, '$1'); tools.text.spell = area.value; toolsSave(); check(); }]);
    if (/[.!?]\s+\p{Ll}/u.test(s)) typo.push(['Phrase qui commence par une minuscule', () => { area.value = area.value.replace(/([.!?]\s+)(\p{Ll})/gu, (m, a, b) => a + b.toUpperCase()); tools.text.spell = area.value; toolsSave(); check(); }]);
    info.textContent = s.trim() ? found.length + ' mot' + (found.length > 1 ? 's' : '') + ' inconnu' + (found.length > 1 ? 's' : '') + ' · ' + typo.length + ' point' + (typo.length > 1 ? 's' : '') + ' de typographie' : '';
    out.replaceChildren(
      ...found.map(w => {
        const r = el('div', 'sysCard px txWord'), sug = by.get(w).slice(0, 5), b = el('div', 'row');
        r.append(el('b', 'bad', w));
        for (const x of sug) { const s2 = el('button', 'btn px', x); s2.onclick = () => replace(w, x); b.append(s2); }
        if (!sug.length) b.append(el('span', 'hint', 'pas de suggestion'));
        const ig = el('button', 'btn ghost px', 'IGNORER'); ig.title = 'Ne plus signaler ce mot (sur tous tes PC)'; ig.onclick = () => { tools.text.ignore.push(w); toolsSave(); check(); };
        b.append(ig); r.append(b); return r;
      }),
      ...typo.map(([l, fix]) => { const r = el('div', 'sysCard px txWord'), b = el('button', 'btn px', 'CORRIGER'); b.onclick = fix; r.append(el('b', 'warn', l), b); return r; }),
      ...(!found.length && !typo.length && s.trim() ? [el('div', 'hint', 'Aucune faute trouvée.')] : []));
    if (s.trim()) toolCount('spellChecks');
  };
  go.onclick = check;
  fixAll.onclick = async () => { const errs = await spellList(area.value); for (const x of errs.reverse()) if (x.s[0]) area.value = area.value.slice(0, x.i) + x.s[0] + area.value.slice(x.i + x.w.length); tools.text.spell = area.value; toolsSave(); check(); toast('Corrigé avec les premières suggestions : relis le texte'); };
  if (area.value.trim()) check();
}

// errors of a text, minus the words added to the dictionary: [{i, w, s}] (Windows' spell checker, more-main.js)
async function spellList(text) { await toolsReady(); const ign = new Set(tools.text.ignore.map(w => w.toLowerCase())); return text.trim() ? (await window.neo.spellText(text)).filter(x => !ign.has(x.w.toLowerCase())) : []; }
// right click in any text field of NeoBase: suggestions for the word under the mouse, then cut / copy / paste
document.addEventListener('contextmenu', async e => {
  if (e.defaultPrevented) return;  // an app's own menu
  const field = e.target.closest?.('textarea, input:not([type]), input[type=text], input[type=search], [contenteditable=true]');
  if (!field || field.readOnly || field.disabled) return;
  e.preventDefault();
  document.querySelector('.spMenu')?.remove();
  let word = '', put = null;
  const isW = c => c && /[\p{L}'’-]/u.test(c), around = (s, p) => { let a = p, b = p; while (a > 0 && isW(s[a - 1])) a--; while (b < s.length && isW(s[b])) b++; return [a, b]; };
  if (field.isContentEditable) {
    const r = document.caretRangeFromPoint(e.clientX, e.clientY);
    if (r?.startContainer.nodeType === 3) {
      const n = r.startContainer, [a, b] = around(n.data, r.startOffset); word = n.data.slice(a, b);
      put = by => { const x = new Range(); x.setStart(n, a); x.setEnd(n, b); getSelection().removeAllRanges(); getSelection().addRange(x); document.execCommand('insertText', false, by); };
    }
  } else {
    await new Promise(r => setTimeout(r));  // the caret moves to the click first
    const s = field.value, [a, b] = around(s, field.selectionStart ?? 0); word = s.slice(a, b);
    put = by => { field.focus(); field.setRangeText(by, a, b, 'end'); field.dispatchEvent(new Event('input', {bubbles: true})); };
  }
  word = word.replace(/^['’-]+|['’-]+$/g, '');
  const m = el('div', 'tbPop tabMenu spMenu px on'), sug = el('div', 'spSug');
  const item = (label, f) => { const b = el('button', 'tbtn tbFull', label); b.onmousedown = ev => ev.preventDefault(); b.onclick = () => { m.remove(); f(); }; m.append(b); return b; };
  m.append(sug);
  if (word.length > 1) {
    sug.append(el('span', 'hint', 'Vérification de « ' + word + ' »…'));
    spellList(word).then(r => {
      const x = r[0];
      sug.replaceChildren(...(!x ? [el('span', 'hint', '« ' + word + ' » : pas de faute')] : x.s.length ? x.s.map(s2 => { const b = el('button', 'tbtn tbFull spFix', s2); b.onmousedown = ev => ev.preventDefault(); b.onclick = () => { m.remove(); put?.(s2); }; return b; }) : [el('span', 'hint', 'Mot inconnu, pas de suggestion')]));
      if (x) { const add = el('button', 'tbtn tbFull', 'Ajouter « ' + word + ' » au dictionnaire'); add.onclick = () => { m.remove(); tools.text.ignore.push(word); toolsSave(); toast('« ' + word + ' » ne sera plus signalé (sur tous tes PC)'); document.dispatchEvent(new Event('neo-spell-dict')); }; sug.append(add); }
    }).catch(() => sug.replaceChildren(el('span', 'hint', 'Correcteur indisponible')));
  }
  m.append(el('hr'));
  item('Couper', () => document.execCommand('cut')); item('Copier', () => document.execCommand('copy'));
  item('Coller', async () => { field.focus(); if (!document.execCommand('paste')) { const t = await navigator.clipboard.readText().catch(() => ''); if (t) document.execCommand('insertText', false, t); } });
  item('Tout sélectionner', () => { field.focus(); if (field.select) field.select(); else document.execCommand('selectAll'); });
  m.style.left = Math.min(e.clientX, innerWidth - 290) + 'px'; m.style.top = Math.min(e.clientY, document.body.clientHeight - 330) + 'px'; m.style.right = 'auto';
  document.body.append(m);
  setTimeout(() => document.addEventListener('pointerdown', function off(ev) { if (!m.contains(ev.target)) { m.remove(); document.removeEventListener('pointerdown', off, true); } }, true));
});

txMount();  // (non indenté : les textes sur plusieurs lignes restent exactement les tiens)
  // ---- fin ----
  ctx.onOpen(() => { txOpen(); });
}
