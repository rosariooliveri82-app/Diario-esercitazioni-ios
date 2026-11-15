'use strict';
/* Diario Esercitazioni - registro personale su telefono. Dati solo sul dispositivo (localStorage). */
const KEY = 'diario_esercitazioni_v1';
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const dkey = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const tkey = d => dkey(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
const P = s => new Date(s);
const fd = k => k ? k.slice(8, 10) + '/' + k.slice(5, 7) + '/' + k.slice(0, 4) : '';
const ft = s => s ? s.slice(11, 16) : '';
const hm = h => { const m = Math.round(Math.max(0, h) * 60); return Math.floor(m / 60) + ':' + pad(m % 60); };
const eur = n => (n || 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const nextDay = g => new Date(g.getFullYear(), g.getMonth(), g.getDate() + 1);
const dayStart = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const GG = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
function parseOre(s) { s = String(s || '').trim(); const m = s.match(/^(\d+)\s*[:hH]\s*(\d{1,2})$/); if (m) return +m[1] + Math.min(59, +m[2]) / 60; return parseFloat(s.replace(',', '.')) || 0; }
const STR_TIPI = ['FERIALE DIURNO', 'FER.N. E FEST.DIURNO', 'FER.D. E FEST.NOTT.', 'FESTIVO NOTTURNO', 'NOTTURNO FESTIVO'];
const STATI = { da_pagare: 'Da pagare', sospeso: 'In sospeso', pagato: 'Pagato' };
const TIPI = { presenza: 'Presenza', guardia: 'Servizio di guardia (CFG)', straordinario: 'Straordinario' };

/* ---------- stato ---------- */
function defState() {
  return { v: 1, profilo: { cognome: '', nome: '', grado: '', grado_marcia: '', grado_str: '', ente: 'CENTRO DI ECCELLENZA C-MINI/MICRO APR' },
    imp: { ore_lun_gio: 8, ore_ven: 4, inizio: '08:00', str_fine_lun_gio: '16:30', str_fine_ven: '12:00', ore_cfg: 8, soglia_marcia: 3, rap: 9.15, irpef: 38 },
    listino: JSON.parse(JSON.stringify(window.LISTINO_INIZIALE)), attivita: [], note: [] };
}
let S;
function load() { try { const t = localStorage.getItem(KEY); S = t ? Object.assign(defState(), JSON.parse(t)) : defState(); } catch (e) { S = defState(); } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { alert('Impossibile salvare i dati sul telefono (memoria piena o navigazione privata).'); } }
const att = id => S.attivita.find(a => a.id === id);

/* ---------- tariffe ---------- */
const rCfi = () => S.listino.cfi.find(r => r.grado === S.profilo.grado);
function rateCfg() { const r = rCfi(); if (!r) return 0; const f = S.listino.cfg.find(x => x.fascia === r.fascia_cfg); return f ? +f.importo : +r.cfg || 0; }
function rateMarcia() { const g = S.profilo.grado_marcia || S.profilo.grado; const r = S.listino.marcia.find(x => x.grado === g); return r ? +r.importo : 0; }
function rateStr(tipo) { const [g, q] = (S.profilo.grado_str || '||').split('||'); const r = S.listino.straordinari.find(x => x.grado === g && x.qualifica === q && x.tipo === tipo); return r ? { imp: +r.importo, rit: +r.ritenuta_pct || 0 } : null; }

/* ---------- calcoli (stessa logica dell'applicazione dell'ufficio) ---------- */
function oreOrd(a, b) {
  if (b <= a) return 0; let tot = 0; const [hh, mm] = (S.imp.inizio || '08:00').split(':').map(Number);
  for (let g = dayStart(a); g <= b; g = nextDay(g)) {
    const w = (g.getDay() + 6) % 7 + 1; const ore = w <= 4 ? +S.imp.ore_lun_gio : (w === 5 ? +S.imp.ore_ven : 0); if (ore <= 0) continue;
    const ini = new Date(g.getFullYear(), g.getMonth(), g.getDate(), hh, mm || 0); const fin = new Date(ini.getTime() + ore * 3600000);
    tot += Math.max(0, Math.min(b, fin) - Math.max(a, ini)) / 3600000;
  } return tot;
}
/* Straordinario: si tolgono le ore dell'orario ordinario (lun-gio 8:00-16:30, ven 8:00-12:00 di default) */
function oreStr(a, b) {
  if (b <= a) return 0; let tot = (b - a) / 3600000;
  const [h1, m1] = (S.imp.inizio || '08:00').split(':').map(Number);
  for (let g = dayStart(a); g <= b; g = nextDay(g)) {
    const w = g.getDay(); if (w === 0 || w === 6) continue;
    const fin = (w === 5 ? S.imp.str_fine_ven : S.imp.str_fine_lun_gio) || (w === 5 ? '12:00' : '16:30'); const [h2, m2] = fin.split(':').map(Number);
    const i0 = new Date(g.getFullYear(), g.getMonth(), g.getDate(), h1, m1 || 0), f0 = new Date(g.getFullYear(), g.getMonth(), g.getDate(), h2, m2 || 0);
    tot -= Math.max(0, Math.min(b, f0) - Math.max(a, i0)) / 3600000;
  } return Math.max(0, tot);
}
function cfgGiorni(a, b, sm) {
  if ((b - a) / 3600000 < 24 - 1e-9) return {}; const pg = +S.imp.ore_cfg || 8; const out = {}; let cum = 0, dati = 0;
  for (let g = dayStart(a); g <= b; g = nextDay(g)) {
    const g1 = nextDay(g); const lo = new Date(Math.max(a, g)), hi = new Date(Math.min(b, g1));
    cum += Math.max(0, hi - lo) / 3600000 - oreOrd(lo, hi);
    const tot = Math.floor(Math.max(0, cum - Math.max(0, sm)) / pg + 1e-9); out[dkey(g)] = tot - dati; dati = tot;
  } return out;
}
function residuo(a, b, sm) {
  const ore = (b - a) / 3600000; if (ore < 24 - 1e-9) return 0; const pg = +S.imp.ore_cfg || 8;
  const u = Math.max(0, ore - oreOrd(a, b) - Math.max(0, sm)); const r = (u + 1e-6) % pg; return r < 0.01 ? 0 : r;
}
function oreSuGiorno(a, b, k) { const g = P(k + 'T00:00'); return Math.max(0, Math.min(b, nextDay(g)) - Math.max(a, g)) / 3600000; }
function giorniTra(a, b) { const out = []; for (let g = dayStart(a); g <= b; g = nextDay(g)) { if (g.getTime() === b.getTime() && g > dayStart(a)) break; out.push(dkey(g)); } return out; }
const festivo = (at, k) => { const w = P(k + 'T00:00').getDay(); return w === 0 || w === 6 || (at.festivi || []).includes(k); };
const netto = (l, rit) => l * (1 - rit / 100);

function calcola(at) {
  const now = new Date();
  const voci = at.voci.map(v => ({ ...v, a: P(v.ini), b: v.fin ? P(v.fin) : now, aperta: !v.fin })).filter(v => v.b > v.a).sort((x, y) => x.a - y.a);
  const guardDays = {}, presH = {}, marH = {}, guardie = [], strao = [];
  for (const v of voci) {
    if (v.marcia && v.tipo !== 'straordinario') for (const k of giorniTra(v.a, v.b)) marH[k] = (marH[k] || 0) + oreSuGiorno(v.a, v.b, k);
    if (v.tipo === 'guardia') {
      const perG = cfgGiorni(v.a, v.b, +v.smont || 0); const n = Object.values(perG).reduce((s, x) => s + x, 0);
      guardie.push({ v, perG, n, res: residuo(v.a, v.b, +v.smont || 0), ore: (v.b - v.a) / 3600000, ord: oreOrd(v.a, v.b) });
      for (const k of giorniTra(v.a, v.b)) guardDays[k] = (guardDays[k] || 0) + oreSuGiorno(v.a, v.b, k);
    } else if (v.tipo === 'straordinario') {
      const lordaOre = (v.b - v.a) / 3600000; const ore = oreStr(v.a, v.b); const r = rateStr(v.str_tipo || STR_TIPI[0]);
      strao.push({ v, ore, lordaOre, rate: r, lordo: r ? ore * r.imp : 0 });
    } else {
      for (const k of giorniTra(v.a, v.b)) presH[k] = (presH[k] || 0) + oreSuGiorno(v.a, v.b, k);
    }
  }
  const cfiFer = [], cfiFest = [], marcia = [];
  for (const k of Object.keys(presH).sort()) if (!guardDays[k]) (festivo(at, k) ? cfiFest : cfiFer).push(k);
  for (const k of Object.keys(marH).sort()) if (marH[k] >= +S.imp.soglia_marcia - 1e-9) marcia.push(k);
  const rfDays = [...new Set([...Object.keys(presH), ...Object.keys(guardDays)])].filter(k => festivo(at, k)).sort();
  const nCfg = guardie.reduce((s, g) => s + g.n, 0); const resTot = guardie.reduce((s, g) => s + g.res, 0);
  const r = rCfi();
  const cfi = { fer: cfiFer, fest: cfiFest, rf: r ? +r.cfi_feriale : 0, rs: r ? +r.cfi_festivo : 0 }; cfi.lordo = cfiFer.length * cfi.rf + cfiFest.length * cfi.rs;
  const cfg = { guardie, n: nCfg, res: resTot, rate: rateCfg(), rf: rfDays }; cfg.lordo = nCfg * cfg.rate;
  const mar = { giorni: marcia, rate: rateMarcia() }; mar.lordo = marcia.length * mar.rate;
  const st = { voci: strao, ore: strao.reduce((s, x) => s + x.ore, 0), lordo: strao.reduce((s, x) => s + x.lordo, 0), nett: strao.reduce((s, x) => s + netto(x.lordo, x.rate ? x.rate.rit : 0), 0) };
  const rapN = l => l * (1 - S.imp.rap / 100), irN = l => rapN(l) * (1 - S.imp.irpef / 100);
  cfi.netto = irN(cfi.lordo); cfg.netto = irN(cfg.lordo); mar.netto = mar.lordo;
  const tot = { lordo: cfi.lordo + cfg.lordo + mar.lordo + st.lordo, netto: cfi.netto + cfg.netto + mar.netto + st.nett };
  return { voci, presH, marH, guardDays, cfi, cfg, mar, st, tot, rfDays, rapN, irN };
}
const pag = (at, k) => (at.pag && at.pag[k]) || { stato: 'da_pagare', data: '', perc: '', note: '' };
const VOCI = { cfi: 'CFI (compenso forfettario d\'impiego)', cfg: 'CFG (compenso forfettario di guardia)', marcia: 'Indennità di marcia', strao: 'Compenso per lavoro straordinario' };
const slot = k => k === 'strao' ? 'st' : k === 'marcia' ? 'mar' : k;
function importoNetto(c, k) { return k === 'strao' ? c.st.nett : c[slot(k)].netto; }
function importoLordo(c, k) { return c[slot(k)].lordo; }
function totaliPagamenti(list) {
  const t = { pagato: 0, da_pagare: 0, sospeso: 0, lordo: 0 };
  for (const at of list) { const c = calcola(at); for (const k of Object.keys(VOCI)) { const n = importoNetto(c, k); if (n <= 0) continue; const p = pag(at, k); t[p.stato] += (p.stato === 'pagato' && p.perc !== '' ? +p.perc : n); t.lordo += importoLordo(c, k); } }
  return t;
}

/* ---------- vista ---------- */
const app = $('#app'), titolo = $('#titolo'), back = $('#indietro'), tabs = $('#tabs');
let installEv = null; window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEv = e; if (location.hash.startsWith('#/dati')) route(); });
let tick = null;
const R = () => (location.hash || '#/').slice(2).split('/');
function nav(h) { location.hash = h; }
window.addEventListener('hashchange', route);
back.onclick = () => history.length > 1 ? history.back() : nav('#/');

function setTabs(on) {
  tabs.innerHTML = [['', '📋', 'Attività'], ['note', '📝', 'Note'], ['profilo', '👤', 'Profilo'], ['listino', '💶', 'Listino'], ['dati', '⚙️', 'Dati']]
    .map(([h, i, t]) => `<a href="#/${h}" class="${on === h ? 'on' : ''}"><b>${i}</b>${t}</a>`).join('');
}
function route() {
  clearInterval(tick); const r = R(); window.scrollTo(0, 0);
  const pg = r[0] || '';
  if (pg !== 'listino') ltSbloc = false;
  setTabs(['note', 'profilo', 'listino', 'dati'].includes(pg) ? pg : '');
  back.style.display = pg === 'a' || pg === 'nuova' || (pg === 'note' && r[1]) ? '' : 'none';
  if (pg === 'note') vNote(r[1], r[2]); else if (pg === 'profilo') vProfilo(); else if (pg === 'listino') vListino(); else if (pg === 'dati') vDati();
  else if (pg === 'nuova') vNuova(); else if (pg === 'a' && att(r[1])) vAtt(att(r[1]), r[2] || 'registro', r[3]);
  else vHome();
}

function vHome() {
  titolo.textContent = 'Le mie attività';
  const t = totaliPagamenti(S.attivita);
  const ok = S.profilo.grado ? '' : `<div class="card" style="border-color:var(--warn)"><b>Prima configurazione</b><div class="mute">Imposta grado e dati personali nella scheda <a href="#/profilo">Profilo</a>: servono per applicare le tariffe corrette.</div></div>`;
  app.innerHTML = ok + `<div class="card"><h2>Riepilogo complessivo</h2><div class="kpi">
    <div>Pagato<b style="color:var(--ok)">${eur(t.pagato)}</b></div><div>Da pagare<b style="color:var(--warn)">${eur(t.da_pagare)}</b></div>
    <div>In sospeso<b>${eur(t.sospeso)}</b></div><div>Lordo totale<b>${eur(t.lordo)}</b></div></div></div>
    <button class="b" onclick="nav('#/nuova')">+ Nuova attività</button><div style="height:12px"></div>` +
    (S.attivita.length ? S.attivita.slice().sort((x, y) => (y.dal || '').localeCompare(x.dal || '')).map(a => {
      const c = calcola(a); const aperta = a.voci.some(v => !v.fin);
      return `<a href="#/a/${a.id}" style="text-decoration:none;color:inherit"><div class="card"><div class="row" style="flex-wrap:nowrap"><div><b>${esc(a.nome)}</b><div class="mute">${fd(a.dal)}${a.al ? ' – ' + fd(a.al) : ''}${a.luogo ? ' · ' + esc(a.luogo) : ''}</div></div>
      ${aperta ? '<span class="tag g" style="flex:none">in corso</span>' : ''}</div><div class="mute" style="margin-top:6px">Netto stimato <b>${eur(c.tot.netto)}</b> · lordo ${eur(c.tot.lordo)}</div></div></a>`;
    }).join('') : '<p class="mute">Nessuna attività. Creane una per iniziare a registrare ingressi e uscite.</p>');
}

function vNuova() {
  titolo.textContent = 'Nuova attività';
  app.innerHTML = `<div class="card"><label>Nome dell'attività</label><input id="n" placeholder="es. Esercitazione PROMETEO XIII"><label>Luogo</label><input id="l">
  <div class="row"><div><label>Dal</label><input id="d" type="date" value="${dkey(new Date())}"></div><div><label>Al</label><input id="a" type="date"></div></div><div style="height:12px"></div>
  <button class="b" id="ok">Crea attività</button></div>`;
  $('#ok').onclick = () => { const nome = $('#n').value.trim(); if (!nome) { alert('Scrivi il nome dell\'attività.'); return; }
    const a = { id: uid(), nome, luogo: $('#l').value.trim(), dal: $('#d').value, al: $('#a').value, voci: [], festivi: [], pag: {} }; S.attivita.push(a); save(); nav('#/a/' + a.id); };
}

function chipsHtml(opts, cur, act) { return `<div class="chips">${opts.map(([k, t]) => `<button class="chip ${cur === k ? 'on' : ''}" data-${act}="${k}">${t}</button>`).join('')}</div>`; }

function vAtt(at, sub, extra) {
  titolo.textContent = at.nome;
  const nav3 = chipsHtml([['registro', 'Registro'], ['riepilogo', 'Riepilogo'], ['pagamenti', 'Pagamenti'], ['statini', 'Statini'], ['note', 'Note']], sub, 'sub');
  app.innerHTML = nav3; app.querySelectorAll('[data-sub]').forEach(b => b.onclick = () => nav(`#/a/${at.id}/${b.dataset.sub}`));
  const box = document.createElement('div'); app.appendChild(box);
  if (sub === 'riepilogo') rRiepilogo(at, box); else if (sub === 'pagamenti') rPagamenti(at, box); else if (sub === 'statini') rStatini(at, box, extra); else if (sub === 'note') rNoteAtt(at, box); else rRegistro(at, box);
}

/* ----- registro ----- */
let tipoSel = 'presenza', strSel = STR_TIPI[0], marSel = false;
function rRegistro(at, box) {
  const aperta = at.voci.find(v => !v.fin);
  let h = '';
  if (aperta) {
    h += `<div class="card live"><b>In corso: ${TIPI[aperta.tipo]}</b><div class="mute">dal ${fd(aperta.ini.slice(0, 10))} alle ${ft(aperta.ini)}</div>
    <div style="font-size:28px;font-weight:700;margin:6px 0" id="live"></div>
    ${aperta.tipo !== 'straordinario' ? `<label class="chk"><input type="checkbox" id="live-mar" ${aperta.marcia ? 'checked' : ''}> Sto facendo anche la marcia</label>` : ''}<button class="b big" id="esci">${aperta.tipo === 'guardia' ? 'Fine servizio (smonto) adesso' : 'Uscita adesso'}</button>
    <div style="height:8px"></div><button class="b sec sm" data-mod="${aperta.id}">Correggi orario</button></div>`;
  } else {
    h += `<div class="card"><h2>Cosa stai facendo?</h2>${chipsHtml(Object.entries(TIPI), tipoSel, 'tipo')}
    ${tipoSel === 'straordinario' ? `<label>Tipo di straordinario</label><select id="strsel">${STR_TIPI.map(t => `<option ${t === strSel ? 'selected' : ''}>${t}</option>`).join('')}</select>` : ''}
    ${tipoSel !== 'straordinario' ? `<label class="chk"><input type="checkbox" id="new-mar" ${marSel ? 'checked' : ''}> Faccio anche la marcia</label>` : ''}
    <div style="height:10px"></div><button class="b big" id="entra">${tipoSel === 'presenza' ? 'Ingresso adesso' : tipoSel === 'guardia' ? 'Monto di guardia adesso' : 'Inizio straordinario adesso'}</button></div>`;
  }
  h += `<button class="b sec" data-mod="nuovo">+ Aggiungi a mano (orario diverso)</button><div id="form"></div><div style="height:12px"></div>`;
  const byDay = {}; for (const v of at.voci) (byDay[v.ini.slice(0, 10)] ||= []).push(v);
  const days = Object.keys(byDay).sort().reverse();
  h += days.length ? days.map(k => `<div class="card"><b>${GG[P(k + 'T00:00').getDay()]} ${fd(k)}</b>${festivo(at, k) ? ' <span class="tag s">festivo</span>' : ''}
    ${byDay[k].sort((x, y) => x.ini.localeCompare(y.ini)).map(v => { const b = v.fin ? P(v.fin) : new Date(); const ore = (b - P(v.ini)) / 3600000;
      return `<div class="item" data-mod="${v.id}"><div><span class="tag ${v.tipo === 'guardia' ? 'g' : v.tipo === 'straordinario' ? 's' : ''}">${TIPI[v.tipo].split(' (')[0]}</span> ${ft(v.ini)} → ${v.fin ? (v.fin.slice(0, 10) !== v.ini.slice(0, 10) ? fd(v.fin.slice(0, 10)) + ' ' : '') + ft(v.fin) : '<b>in corso</b>'}
      ${v.tipo === 'straordinario' ? `<div class="mute">${esc(v.str_tipo || '')} · pagate ${hm(oreStr(P(v.ini), b))} h</div>` : ''}${v.marcia ? ' <span class="tag s">marcia</span>' : ''}${v.note ? `<div class="mute">${esc(v.note)}</div>` : ''}</div><div class="mute" style="white-space:nowrap">${hm(ore)} h ›</div></div>`; }).join('')}</div>`).join('')
    : '<p class="mute">Ancora nessuna registrazione.</p>';
  h += `<div class="card"><h2>Festività infrasettimanali</h2><div class="mute">Sabato e domenica sono già festivi. Aggiungi qui gli altri giorni festivi dell'attività.</div>
    <div class="row" style="flex-wrap:nowrap;margin-top:6px"><input type="date" id="fest"><button class="b sm" id="addfest" style="flex:none">Aggiungi</button></div>
    <div class="chips">${(at.festivi || []).map(k => `<button class="chip" data-delfest="${k}">${fd(k)} ✕</button>`).join('')}</div></div>
    <button class="b ko sm" id="delatt">Elimina attività</button>`;
  box.innerHTML = h;
  box.querySelectorAll('[data-tipo]').forEach(b => b.onclick = () => { tipoSel = b.dataset.tipo; rRegistro(at, box); });
  const nm = $('#new-mar', box); if (nm) nm.onchange = () => marSel = nm.checked;
  const lm = $('#live-mar', box); if (lm) lm.onchange = () => { aperta.marcia = lm.checked; save(); };
  const ss = $('#strsel', box); if (ss) ss.onchange = () => strSel = ss.value;
  const en = $('#entra', box); if (en) en.onclick = () => { at.voci.push({ id: uid(), tipo: tipoSel, ini: tkey(new Date()), fin: '', str_tipo: tipoSel === 'straordinario' ? strSel : '', smont: 0, note: '', marcia: tipoSel !== 'straordinario' && marSel }); save(); rRegistro(at, box); startLive(at); };
  const es = $('#esci', box); if (es) es.onclick = () => { aperta.fin = tkey(new Date()); if (aperta.fin <= aperta.ini) aperta.fin = ''; save(); if (!aperta.fin) { alert('Uscita non valida: ora precedente all\'ingresso.'); } rRegistro(at, box); };
  box.querySelectorAll('[data-mod]').forEach(b => b.onclick = () => formVoce(at, b.dataset.mod, box));
  $('#addfest', box).onclick = () => { const v = $('#fest', box).value; if (v) { (at.festivi ||= []).includes(v) || at.festivi.push(v); save(); rRegistro(at, box); } };
  box.querySelectorAll('[data-delfest]').forEach(b => b.onclick = () => { at.festivi = at.festivi.filter(x => x !== b.dataset.delfest); save(); rRegistro(at, box); });
  $('#delatt', box).onclick = () => { if (confirm('Eliminare l\'attività e tutte le sue registrazioni?')) { S.attivita = S.attivita.filter(x => x !== at); save(); nav('#/'); } };
  startLive(at);
}
function startLive(at) { clearInterval(tick); const a = at.voci.find(v => !v.fin); const el = $('#live'); if (!a || !el) return; const f = () => { const e = $('#live'); if (e) e.textContent = hm((Date.now() - P(a.ini)) / 3600000) + ' h'; }; f(); tick = setInterval(f, 15000); }
function formVoce(at, id, box) {
  const v = id === 'nuovo' ? { id: uid(), tipo: 'presenza', ini: dkey(new Date()) + 'T08:00', fin: '', str_tipo: STR_TIPI[0], smont: 0, note: '', _n: 1 } : at.voci.find(x => x.id === id);
  const f = $('#form', box);
  f.innerHTML = `<div class="card"><h2>${v._n ? 'Nuova registrazione' : 'Modifica registrazione'}</h2>
  <label>Tipo</label><select id="f-t">${Object.entries(TIPI).map(([k, t]) => `<option value="${k}" ${v.tipo === k ? 'selected' : ''}>${t}</option>`).join('')}</select>
  <label>Inizio (ingresso)</label><input type="datetime-local" id="f-i" value="${v.ini}"><label>Fine (uscita) — lascia vuoto se è ancora in corso</label><input type="datetime-local" id="f-f" value="${v.fin || ''}">
  <div id="f-s" style="display:none"><label>Tipo di straordinario</label><select id="f-st">${STR_TIPI.map(t => `<option ${t === v.str_tipo ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
  <div id="f-m"><label class="chk"><input type="checkbox" id="f-mar" ${v.marcia ? 'checked' : ''}> Sto facendo anche la marcia</label></div>
  <div id="f-g" style="display:none"><label>Ore di smontante / recupero da togliere (es. 1:30)</label><input id="f-sm" value="${v.smont ? hm(+v.smont) : ''}" placeholder="0:00"></div>
  <label>Note</label><input id="f-n" value="${esc(v.note || '')}"><div style="height:10px"></div>
  <div class="row"><button class="b" id="f-ok">Salva</button><button class="b sec" id="f-no">Annulla</button></div>${v._n ? '' : '<div style="height:8px"></div><button class="b ko sm" id="f-del">Elimina</button>'}</div>`;
  const sync = () => { const t = $('#f-t').value; $('#f-s').style.display = t === 'straordinario' ? '' : 'none'; $('#f-g').style.display = t === 'guardia' ? '' : 'none'; $('#f-m').style.display = t === 'straordinario' ? 'none' : ''; }; $('#f-t').onchange = sync; sync();
  f.scrollIntoView({ behavior: 'smooth' });
  $('#f-no').onclick = () => f.innerHTML = '';
  const d = $('#f-del'); if (d) d.onclick = () => { if (confirm('Eliminare questa registrazione?')) { at.voci = at.voci.filter(x => x !== v); save(); rRegistro(at, box); } };
  $('#f-ok').onclick = () => {
    const ini = $('#f-i').value, fin = $('#f-f').value; if (!ini) { alert('Indica l\'inizio.'); return; } if (fin && fin <= ini) { alert('La fine deve essere dopo l\'inizio.'); return; }
    if (!fin && at.voci.some(x => !x.fin && x !== v)) { alert('C\'è già una registrazione in corso: chiudila prima.'); return; }
    Object.assign(v, { tipo: $('#f-t').value, ini, fin, str_tipo: $('#f-st').value, smont: parseOre($('#f-sm').value), marcia: $('#f-t').value !== 'straordinario' && $('#f-mar').checked, note: $('#f-n').value.trim() }); delete v._n;
    if (!at.voci.includes(v)) at.voci.push(v); save(); rRegistro(at, box);
  };
}

/* ----- riepilogo ----- */
function warnTariffe() {
  const m = []; if (!S.profilo.grado) m.push('il grado (CFI e CFG)'); else if (!rCfi()) m.push('un grado presente nel listino');
  if (!S.profilo.grado_str) m.push('la qualifica per lo straordinario');
  return m.length ? `<div class="card" style="border-color:var(--warn)">Per calcolare tutti i compensi imposta nel <a href="#/profilo">Profilo</a>: ${m.join(', ')}.</div>` : '';
}
function rRiepilogo(at, box) {
  const c = calcola(at);
  const riga = (n, d, l, nt) => `<tr><td>${n}<div class="mute">${d}</div></td><td class="n">${eur(l)}</td><td class="n"><b>${eur(nt)}</b></td></tr>`;
  let h = warnTariffe() + `<div class="card"><h2>Conteggio</h2><div class="kpi">
    <div>CFI feriali<b>${c.cfi.fer.length}</b></div><div>CFI festivi<b>${c.cfi.fest.length}</b></div>
    <div>CFG maturati<b>${c.cfg.n}</b></div><div>RF (riposi festivi)<b>${c.rfDays.length}</b>${c.rfDays.length ? `<span class="mute" style="font-size:11px">${c.rfDays.map(k => fd(k).slice(0, 5)).join(' · ')}</span>` : ''}</div>
    <div>Ore residue recupero<b>${hm(c.cfg.res)}</b></div><div>Giorni di marcia<b>${c.mar.giorni.length}</b></div>
    <div>Ore straordinario<b>${hm(c.st.ore)}</b></div><div>Ore ordinarie/giorno<b>${S.imp.ore_lun_gio}/${S.imp.ore_ven}</b></div></div></div>
    <div class="card"><h2>Compensi</h2><table><tr><th>Voce</th><th class="n">Lordo</th><th class="n">Netto</th></tr>
    ${riga('CFI', `${c.cfi.fer.length} × ${eur(c.cfi.rf)} + ${c.cfi.fest.length} × ${eur(c.cfi.rs)}`, c.cfi.lordo, c.cfi.netto)}
    ${riga('CFG', `${c.cfg.n} × ${eur(c.cfg.rate)}`, c.cfg.lordo, c.cfg.netto)}
    ${riga('Marcia', `${c.mar.giorni.length} × ${eur(c.mar.rate)}`, c.mar.lordo, c.mar.netto)}
    ${riga('Straordinario', hm(c.st.ore) + ' ore', c.st.lordo, c.st.nett)}
    <tr><td><b>Totale</b></td><td class="n"><b>${eur(c.tot.lordo)}</b></td><td class="n"><b>${eur(c.tot.netto)}</b></td></tr></table>
    <div class="mute" style="margin-top:6px">Netto CFI/CFG = lordo − ${S.imp.rap}% (RAP) e −${S.imp.irpef}% IRPEF. Marcia solo se spuntata nelle registrazioni, al lordo. Straordinario netto della ritenuta del listino. Stime: fa fede il cedolino.</div></div>`;
  if (c.cfg.guardie.length) h += `<div class="card"><h2>Servizi di guardia</h2>${c.cfg.guardie.map(g => `<div class="item"><div>${fd(g.v.ini.slice(0, 10))} ${ft(g.v.ini)} → ${g.v.aperta ? 'in corso' : fd(g.v.fin.slice(0, 10)) + ' ' + ft(g.v.fin)}<div class="mute">${hm(g.ore)} h − ${hm(g.ord)} ordinarie${g.v.smont ? ' − ' + hm(+g.v.smont) + ' smontante' : ''}</div>
    <div class="mute">CFG per giorno: ${Object.entries(g.perG).filter(([, n]) => n).map(([k, n]) => fd(k).slice(0, 5) + '=' + n).join(' · ') || '—'}</div></div><div><b>${g.n} CFG</b>${g.res ? `<div class="mute">+${hm(g.res)} h</div>` : ''}</div></div>`).join('')}</div>`;
  box.innerHTML = h;
}

/* ----- pagamenti ----- */
function rPagamenti(at, box) {
  const c = calcola(at); const t = totaliPagamenti([at]);
  let h = `<div class="card"><div class="kpi"><div>Pagato<b style="color:var(--ok)">${eur(t.pagato)}</b></div><div>Da pagare<b style="color:var(--warn)">${eur(t.da_pagare)}</b></div><div>In sospeso<b>${eur(t.sospeso)}</b></div><div>Netto totale<b>${eur(c.tot.netto)}</b></div></div></div>`;
  for (const k of Object.keys(VOCI)) {
    const n = importoNetto(c, k); const p = pag(at, k);
    h += `<div class="card"><div class="row" style="flex-wrap:nowrap"><div><b>${VOCI[k]}</b><div class="mute">Lordo ${eur(importoLordo(c, k))} · netto stimato <b>${eur(n)}</b></div></div><span class="tag ${p.stato === 'pagato' ? 'ok' : p.stato === 'sospeso' ? 'k' : 'w'}" style="flex:none">${STATI[p.stato]}</span></div>
    <div class="chips">${Object.entries(STATI).map(([s, t]) => `<button class="chip ${p.stato === s ? 'on' : ''}" data-k="${k}" data-s="${s}">${t}</button>`).join('')}</div>
    ${p.stato === 'pagato' ? `<div class="row"><div><label>Data pagamento</label><input type="date" data-f="data" data-k="${k}" value="${p.data || ''}"></div><div><label>Importo percepito (€)</label><input inputmode="decimal" data-f="perc" data-k="${k}" value="${p.perc}" placeholder="${n.toFixed(2)}"></div></div>` : ''}
    <label>Note</label><input data-f="note" data-k="${k}" value="${esc(p.note || '')}"></div>`;
  }
  box.innerHTML = h;
  const set = (k, o) => { (at.pag ||= {})[k] = Object.assign(pag(at, k), o); save(); };
  box.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { const o = { stato: b.dataset.s }; if (o.stato === 'pagato' && !pag(at, b.dataset.k).data) o.data = dkey(new Date()); set(b.dataset.k, o); rPagamenti(at, box); });
  box.querySelectorAll('[data-f]').forEach(i => i.onchange = () => { const o = {}; o[i.dataset.f] = i.dataset.f === 'perc' ? i.value.replace(',', '.') : i.value; set(i.dataset.k, o); rPagamenti(at, box); });
}

/* ----- statini ----- */
function rStatini(at, box, tipo) {
  if (!tipo) {
    box.innerHTML = `<div class="card"><h2>Statini da stampare</h2><div class="mute">Scegli lo statino: potrai stamparlo o salvarlo in PDF dal telefono.</div><div style="height:8px"></div>
    ${[['cfi', 'Statino CFI'], ['cfg', 'Statino CFG'], ['marcia', 'Statino indennità di marcia'], ['strao', 'Statino lavoro straordinario'], ['tutto', 'Riepilogo compensi e pagamenti']].map(([k, t]) => `<button class="b sec" style="margin-bottom:8px" data-st="${k}">${t}</button>`).join('')}</div>`;
    box.querySelectorAll('[data-st]').forEach(b => b.onclick = () => nav(`#/a/${at.id}/statini/${b.dataset.st}`)); return;
  }
  const html = statino(at, tipo);
  box.innerHTML = `<button class="b" id="stampa-btn">🖨 Stampa / Salva PDF</button><div style="height:10px"></div><div class="card" style="background:#fff">${html}</div>`;
  $('#stampa-btn').onclick = () => { $('#stampa').innerHTML = html; setTimeout(() => window.print(), 50); };
}
function statino(at, tipo) {
  const c = calcola(at), pr = S.profilo; const pers = `${esc(pr.grado)} ${esc(pr.cognome)} ${esc(pr.nome)}`.trim() || '(profilo non compilato)';
  const head = `<p><b>${esc(pr.ente)}</b></p><h3>${{ cfi: 'STATINO COMPENSO FORFETTARIO D\'IMPIEGO (CFI)', cfg: 'STATINO COMPENSO FORFETTARIO DI GUARDIA (CFG)', marcia: 'STATINO INDENNITÀ SUPPLEMENTARE DI MARCIA', strao: 'STATINO LAVORO STRAORDINARIO', tutto: 'RIEPILOGO COMPENSI' }[tipo]}</h3>
    <p>Attività: <b>${esc(at.nome)}</b>${at.luogo ? ' – ' + esc(at.luogo) : ''}${at.dal ? ' · dal ' + fd(at.dal) + (at.al ? ' al ' + fd(at.al) : '') : ''}</p><p>Militare: <b>${pers}</b></p><br>`;
  const foot = `<br><p style="text-align:right;margin-right:30px">Firma dell'interessato ______________________</p><p style="font-size:11px">Prospetto compilato dal partecipante con il Diario Esercitazioni; gli importi sono stime al lordo/netto con le tariffe di listino.</p><p style="font-size:10px;text-align:center">© 2026 Designed &amp; Developed by Rosario OLIVERI Vers. 1.1.0</p>`;
  const tb = (th, rows, tot) => `<table><tr>${th.map((x, i) => `<th class="${i ? 'n' : ''}">${x}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map((x, i) => `<td class="${i ? 'n' : ''}">${x}</td>`).join('')}</tr>`).join('')}${tot ? `<tr>${tot.map((x, i) => `<td class="${i ? 'n' : ''}"><b>${x}</b></td>`).join('')}</tr>` : ''}</table>`;
  const dd = k => `${GG[P(k + 'T00:00').getDay()]} ${fd(k)}`;
  let body = '';
  if (tipo === 'cfi') body = tb(['Giorno', 'Tipo', 'Importo'], [...c.cfi.fer.map(k => [dd(k), 'feriale', eur(c.cfi.rf)]), ...c.cfi.fest.map(k => [dd(k), 'festivo', eur(c.cfi.rs)])].sort((x, y) => x[0].slice(4).split('/').reverse().join().localeCompare(y[0].slice(4).split('/').reverse().join())), ['Totale lordo', `${c.cfi.fer.length + c.cfi.fest.length} gg`, eur(c.cfi.lordo)]) + `<p>Netto RAP (−${S.imp.rap}%): ${eur(c.rapN(c.cfi.lordo))} · netto dopo IRPEF ${S.imp.irpef}%: <b>${eur(c.cfi.netto)}</b></p><p>Riposi festivi (RF) maturati: <b>${c.rfDays.length}</b>${c.rfDays.length ? ' (' + c.rfDays.map(k => dd(k)).join(', ') + ')' : ''}</p>`;
  else if (tipo === 'cfg') body = tb(['Servizio', 'Ore', 'CFG', 'Importo'], c.cfg.guardie.map(g => [`${fd(g.v.ini.slice(0, 10))} ${ft(g.v.ini)} → ${g.v.aperta ? 'in corso' : fd(g.v.fin.slice(0, 10)) + ' ' + ft(g.v.fin)}`, hm(g.ore), g.n, eur(g.n * c.cfg.rate)]), ['Totale lordo', '', c.cfg.n, eur(c.cfg.lordo)]) + `<p>Riposi festivi (RF): ${c.rfDays.length} · ore residue di recupero: ${hm(c.cfg.res)}</p><p>Importo CFG: ${eur(c.cfg.rate)} · netto dopo RAP e IRPEF: <b>${eur(c.cfg.netto)}</b></p>`;
  else if (tipo === 'marcia') body = tb(['Giorno', 'Ore di presenza', 'Importo'], c.mar.giorni.map(k => [dd(k), hm(c.marH[k] || 0), eur(c.mar.rate)]), ['Totale', `${c.mar.giorni.length} gg`, eur(c.mar.lordo)]);
  else if (tipo === 'strao') body = tb(['Data', 'Dalle', 'Alle', 'Tipo', 'Ore', 'Importo'], c.st.voci.map(s => [fd(s.v.ini.slice(0, 10)), ft(s.v.ini), s.v.fin ? ft(s.v.fin) : '—', esc(s.v.str_tipo), hm(s.ore) + (s.lordaOre - s.ore > 0.001 ? ' (su ' + hm(s.lordaOre) + ')' : ''), eur(s.lordo)]), ['Totale lordo', '', '', '', hm(c.st.ore), eur(c.st.lordo)]) + `<p style="font-size:11px">Le ore dell'orario ordinario (lun–gio fino alle ${S.imp.str_fine_lun_gio || '16:30'}, ven fino alle ${S.imp.str_fine_ven || '12:00'}, dall'inizio ${S.imp.inizio}) non sono conteggiate come straordinario.</p><p>Netto della ritenuta: <b>${eur(c.st.nett)}</b></p>`;
  else body = tb(['Voce', 'Lordo', 'Netto', 'Stato'], Object.keys(VOCI).map(k => { const p = pag(at, k); return [VOCI[k], eur(importoLordo(c, k)), eur(importoNetto(c, k)), STATI[p.stato] + (p.stato === 'pagato' && p.data ? ' il ' + fd(p.data) : '')]; }), ['Totale', eur(c.tot.lordo), eur(c.tot.netto), '']);
  return head + body + foot;
}


/* ----- note (block notes) ----- */
let nq = '';
const notaTit = n => (n.titolo || '').trim() || (n.testo || '').trim().split('\n')[0].slice(0, 50) || 'Nota senza titolo';
const fdt = iso => iso ? fd(iso.slice(0, 10)) + ' ' + iso.slice(11, 16) : '';
function notaRiga(n) {
  const at = n.att && att(n.att);
  return `<a href="#/note/${n.id}" style="text-decoration:none;color:inherit"><div class="card"><b>${esc(notaTit(n))}</b>
    <div class="mute" style="margin-top:2px;white-space:pre-line;overflow:hidden;max-height:3.2em">${esc((n.testo || '').trim().slice(0, 160))}</div>
    <div class="mute" style="margin-top:4px;font-size:12px">${fdt(n.mod)}${at ? ' · ' + esc(at.nome) : ''}</div></div></a>`;
}
function vNote(id, attId) {
  if (id) return vNotaEd(id, attId);
  titolo.textContent = 'Note';
  const q = nq.trim().toLowerCase();
  const lista = S.note.slice().sort((x, y) => (y.mod || '').localeCompare(x.mod || '')).filter(n => !q || (n.titolo + ' ' + n.testo).toLowerCase().includes(q));
  app.innerHTML = `<button class="b" onclick="nav('#/note/nuova')">+ Nuova nota</button><div style="height:10px"></div>
    <input id="nq" placeholder="Cerca negli appunti…" value="${esc(nq)}"><div style="height:10px"></div>` +
    (lista.length ? lista.map(notaRiga).join('') : `<p class="mute">${S.note.length ? 'Nessuna nota trovata.' : 'Nessun appunto. Tocca «Nuova nota» per scrivere.'}</p>`);
  $('#nq').oninput = e => { nq = e.target.value; clearTimeout(vNote.t); vNote.t = setTimeout(() => { vNote(); const x = $('#nq'); x.focus(); x.setSelectionRange(nq.length, nq.length); }, 250); };
}
function rNoteAtt(at, box) {
  const lista = S.note.filter(n => n.att === at.id).sort((x, y) => (y.mod || '').localeCompare(x.mod || ''));
  box.innerHTML = `<button class="b" onclick="nav('#/note/nuova/${at.id}')">+ Nuova nota per questa attività</button><div style="height:10px"></div>` +
    (lista.length ? lista.map(notaRiga).join('') : '<p class="mute">Nessuna nota collegata a questa attività.</p>');
}
function vNotaEd(id, attId) {
  titolo.textContent = 'Nota';
  let n = id === 'nuova' ? { id: uid(), titolo: '', testo: '', att: attId || '', mod: '', _nuova: true } : S.note.find(x => x.id === id);
  if (!n) { nav('#/note'); return; }
  app.innerHTML = `<div class="card"><label>Titolo</label><input id="n-t" value="${esc(n.titolo)}" placeholder="es. Cose da ricordare">
    <label>Attività collegata (facoltativo)</label><select id="n-a"><option value="">— nessuna —</option>${S.attivita.map(a => `<option value="${a.id}" ${a.id === n.att ? 'selected' : ''}>${esc(a.nome)}</option>`).join('')}</select>
    <label>Appunti</label><textarea id="n-x" rows="14" style="width:100%;font:inherit;padding:10px;border:1px solid var(--line,#cfc9a6);border-radius:10px;background:#fffef8;resize:vertical" placeholder="Scrivi qui…">${esc(n.testo)}</textarea>
    <div class="mute" id="n-s" style="margin-top:6px">${n._nuova ? 'Si salva da solo mentre scrivi.' : 'Ultima modifica: ' + fdt(n.mod)}</div></div>
    <div class="row"><button class="b sec" id="n-cp">Copia testo</button>${n._nuova ? '' : '<button class="b ko" id="n-del">Elimina</button>'}</div>`;
  const sv = () => {
    n.titolo = $('#n-t').value; n.testo = $('#n-x').value; n.att = $('#n-a').value;
    if (n._nuova) { if (!n.titolo.trim() && !n.testo.trim()) return; delete n._nuova; S.note.push(n); }
    n.mod = tkey(new Date()); save(); $('#n-s').textContent = 'Salvato ' + ft(n.mod);
    if (!$('#n-del')) { const r = document.createElement('button'); r.className = 'b ko'; r.id = 'n-del'; r.textContent = 'Elimina'; $('#n-cp').after(r); r.onclick = del; }
  };
  const del = () => { if (confirm('Eliminare questa nota?')) { S.note = S.note.filter(x => x !== n); save(); history.length > 1 ? history.back() : nav('#/note'); } };
  ['#n-t', '#n-x'].forEach(s => $(s).oninput = sv); $('#n-a').onchange = sv;
  $('#n-cp').onclick = () => copiaTesto((n.titolo ? n.titolo + '\n\n' : '') + $('#n-x').value);
  const d = $('#n-del'); if (d) d.onclick = del;
}

/* ----- profilo ----- */
function vProfilo() {
  titolo.textContent = 'Profilo e parametri'; const p = S.profilo, i = S.imp; const bl = !!S.pbloc && !!p.cognome; const dis = bl ? 'disabled' : '';
  const opt = (arr, cur, f) => `<option value="">— scegli —</option>` + arr.map(x => { const [v, t] = f(x); return `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(t)}</option>`; }).join('');
  const strOpts = [...new Map(S.listino.straordinari.map(r => [r.grado + '||' + r.qualifica, r])).values()];
  app.innerHTML = `<div class="card"><h2>Dati personali</h2><div class="row"><div><label>Cognome</label><input ${dis} data-p="cognome" value="${esc(p.cognome)}"></div><div><label>Nome</label><input ${dis} data-p="nome" value="${esc(p.nome)}"></div></div>
    <label>Grado (per CFI e CFG)</label><select ${dis} data-p="grado">${opt(S.listino.cfi, p.grado, r => [r.grado, r.grado])}</select>
    <label>Grado per l'indennità di marcia (se diverso)</label><select ${dis} data-p="grado_marcia">${opt(S.listino.marcia, p.grado_marcia, r => [r.grado, r.grado])}</select>
    <label>Grado e qualifica per lo straordinario</label><select ${dis} data-p="grado_str">${opt(strOpts, p.grado_str, r => [r.grado + '||' + r.qualifica, r.grado + (r.qualifica ? ' ' + r.qualifica : '')])}</select>
    <label>Intestazione degli statini</label><input ${dis} data-p="ente" value="${esc(p.ente)}"></div>
    <div class="card"><h2>Parametri di calcolo</h2><div class="mute">Gli stessi dell'applicazione dell'ufficio: modificali se cambiano.</div>
    <div class="row"><div><label>Ore ordinarie lun–gio</label><input ${dis} inputmode="decimal" data-i="ore_lun_gio" value="${i.ore_lun_gio}"></div><div><label>Ore ordinarie venerdì</label><input ${dis} inputmode="decimal" data-i="ore_ven" value="${i.ore_ven}"></div></div>
    <div class="row"><div><label>Inizio orario di lavoro</label><input ${dis} type="time" data-i="inizio" value="${i.inizio}"></div><div><label>Ore per 1 CFG</label><input ${dis} inputmode="decimal" data-i="ore_cfg" value="${i.ore_cfg}"></div></div>
    <div class="row"><div><label>Straordinario: fine orario lun–gio</label><input ${dis} type="time" data-i="str_fine_lun_gio" value="${i.str_fine_lun_gio || '16:30'}"></div><div><label>Straordinario: fine orario venerdì</label><input ${dis} type="time" data-i="str_fine_ven" value="${i.str_fine_ven || '12:00'}"></div></div>
    <div class="row"><div><label>Soglia marcia (ore)</label><input ${dis} inputmode="decimal" data-i="soglia_marcia" value="${i.soglia_marcia}"></div><div><label>RAP %</label><input ${dis} inputmode="decimal" data-i="rap" value="${i.rap}"></div><div><label>IRPEF %</label><input ${dis} inputmode="decimal" data-i="irpef" value="${i.irpef}"></div></div></div>
    <div style="height:4px"></div>${bl ? '<div class="card" style="border-color:var(--ok)">🔒 Profilo salvato e bloccato.</div><button class="b sec" id="p-mod">✏️ Modifica</button>' : '<button class="b" id="p-save">💾 Salva profilo</button>'}`;
  const sv = $('#p-save'); if (sv) sv.onclick = () => { if (!S.profilo.cognome.trim()) { alert('Inserisci almeno il cognome.'); return; } S.pbloc = true; save(); vProfilo(); window.scrollTo(0, 0); };
  const md = $('#p-mod'); if (md) md.onclick = () => { S.pbloc = false; save(); vProfilo(); };
  app.querySelectorAll('[data-p]').forEach(e => e.onchange = () => { S.profilo[e.dataset.p] = e.value; save(); });
  app.querySelectorAll('[data-i]').forEach(e => e.onchange = () => { S.imp[e.dataset.i] = e.dataset.i === 'inizio' || e.dataset.i.startsWith('str_fine') ? e.value : (parseFloat(String(e.value).replace(',', '.')) || 0); save(); });
}

/* ----- listino ----- */
let lt = 'cfi', lq = '', ltSbloc = false;
function vListino() {
  titolo.textContent = 'Listino tariffe'; const L = S.listino;
  let h = `<div class="card"><b>${esc(L.nome)}</b><div class="mute">Importi modificabili: se esce un aggiornamento, correggi i valori qui oppure importa il file JSON esportato dall'applicazione dell'ufficio.</div>
  <div class="card" style="margin:10px 0;border-color:${ltSbloc ? 'var(--warn)' : 'var(--line,#cfc9a6)'}"><b>${ltSbloc ? '🔓 Modifica attiva' : '🔒 Tabella bloccata'}</b><div class="mute">${ltSbloc ? 'Stai per modificare gli importi: ricontrolla i valori prima di usarli.' : 'Gli importi non si possono cambiare per errore. Sblocca solo se è uscito un aggiornamento.'}</div><div style="height:8px"></div><button class="b ${ltSbloc ? '' : 'sec'} sm" id="l-lock">${ltSbloc ? 'Blocca di nuovo' : 'Sblocca modifiche'}</button></div>
  <div class="row" style="margin-top:8px"><button class="b sec sm" id="l-imp" ${ltSbloc ? '' : 'disabled'}>Importa listino (JSON)</button><button class="b sec sm" id="l-exp">Esporta</button><button class="b sec sm" id="l-rst" ${ltSbloc ? '' : 'disabled'}>Ripristina iniziale</button></div><input type="file" id="l-file" accept=".json,application/json" style="display:none"></div>`;
  h += chipsHtml([['cfi', 'CFI/CFG'], ['marcia', 'Marcia'], ['straordinari', 'Straordinari']], lt, 'lt') + `<input id="lq" placeholder="Cerca grado…" value="${esc(lq)}"><div style="height:8px"></div>`;
  const q = lq.trim().toLowerCase(); const num = (t, i, f, v) => `<input inputmode="decimal" ${ltSbloc ? '' : 'disabled'} style="width:72px;padding:6px;${ltSbloc ? '' : 'background:#eeeadb;color:#333;opacity:1;border-color:transparent'}" data-t="${t}" data-i="${i}" data-f="${f}" value="${v}">`;
  if (lt === 'cfi') h += `<div class="card"><h2>CFG per fascia</h2><table>${L.cfg.map((r, i) => `<tr><td>Fascia ${r.fascia}<div class="mute">${esc(r.gradi)}</div></td><td class="n">${num('cfg', i, 'importo', r.importo)}</td></tr>`).join('')}</table></div>
    <div class="card" style="overflow-x:auto"><table><tr><th>Grado</th><th class="n">Feriale</th><th class="n">Festivo</th><th class="n">CFG</th></tr>${L.cfi.map((r, i) => q && !r.grado.toLowerCase().includes(q) ? '' : `<tr><td>${esc(r.grado)}<div class="mute">fascia ${r.fascia_cfg || '—'}</div></td><td class="n">${num('cfi', i, 'cfi_feriale', r.cfi_feriale)}</td><td class="n">${num('cfi', i, 'cfi_festivo', r.cfi_festivo)}</td><td class="n">${num('cfi', i, 'cfg', r.cfg)}</td></tr>`).join('')}</table></div>`;
  else if (lt === 'marcia') h += `<div class="card"><table>${L.marcia.map((r, i) => q && !r.grado.toLowerCase().includes(q) ? '' : `<tr><td>${esc(r.grado)}</td><td class="n">${num('marcia', i, 'importo', r.importo)}</td></tr>`).join('')}</table></div>`;
  else h += `<div class="card"><table><tr><th>Grado / tipo</th><th class="n">€/ora</th><th class="n">Rit.%</th></tr>${L.straordinari.map((r, i) => q && !(r.grado + ' ' + r.qualifica + ' ' + r.tipo).toLowerCase().includes(q) ? '' : `<tr><td>${esc(r.grado)} ${esc(r.qualifica)}<div class="mute">${esc(r.tipo)}</div></td><td class="n">${num('straordinari', i, 'importo', r.importo)}</td><td class="n">${num('straordinari', i, 'ritenuta_pct', r.ritenuta_pct)}</td></tr>`).join('')}</table></div>`;
  app.innerHTML = h;
  app.querySelectorAll('[data-lt]').forEach(b => b.onclick = () => { lt = b.dataset.lt; vListino(); });
  $('#lq').oninput = e => { lq = e.target.value; clearTimeout(vListino.t); vListino.t = setTimeout(() => { vListino(); const x = $('#lq'); x.focus(); x.setSelectionRange(lq.length, lq.length); }, 250); };
  app.querySelectorAll('input[data-t]').forEach(e => e.onchange = () => { S.listino[e.dataset.t][+e.dataset.i][e.dataset.f] = parseFloat(String(e.value).replace(',', '.')) || 0; save(); });
  $('#l-lock').onclick = () => { if (!ltSbloc && !confirm('Sbloccare la modifica degli importi?')) return; ltSbloc = !ltSbloc; vListino(); };
  $('#l-exp').onclick = () => scarica('listino_diario.json', JSON.stringify(S.listino));
  $('#l-rst').onclick = () => { if (confirm('Ripristinare il listino iniziale? Le modifiche agli importi andranno perse.')) { S.listino = JSON.parse(JSON.stringify(window.LISTINO_INIZIALE)); save(); vListino(); } };
  $('#l-imp').onclick = () => $('#l-file').click();
  $('#l-file').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { S.listino = convListino(JSON.parse(await f.text())); save(); alert('Listino importato.'); vListino(); } catch (x) { alert('File non valido: ' + x.message); } };
}
function convListino(o) {
  const cfi = o.cfi || o.tariffe_cfi, cfg = o.cfg || o.tariffe_cfg_grado, marcia = o.marcia || o.tariffe_marcia, st = o.straordinari || o.tariffe_straordinari;
  if (!cfi || !cfg || !marcia || !st) throw new Error('mancano tabelle (CFI, CFG, marcia, straordinari)');
  const pick = (a, k) => a.map(r => Object.fromEntries(k.map(x => [x, r[x]])));
  return { versione: 1, anno: o.anno, nome: o.nome || 'Listino importato', cfi: pick(cfi, ['grado', 'cfi_feriale', 'cfi_festivo', 'cfg', 'fascia_cfg']), cfg: pick(cfg, ['fascia', 'importo', 'gradi']), marcia: pick(marcia, ['grado', 'importo']), straordinari: pick(st, ['grado', 'qualifica', 'tipo', 'importo', 'ritenuta_pct']) };
}

/* ----- dati ----- */
async function scarica(nome, testo) {
  const C = window.Capacitor, pl = C && C.Plugins;
  try { /* app Android/iOS: salva nella cache e apre la condivisione (Salva nei file, WhatsApp, Drive...) */
    if (C && C.isNativePlatform && C.isNativePlatform() && pl && pl.Filesystem && pl.Share) {
      const r = await pl.Filesystem.writeFile({ path: nome, data: testo, directory: 'CACHE', encoding: 'utf8' });
      await pl.Share.share({ title: nome, dialogTitle: 'Salva o invia il file', url: r.uri }); return;
    }
  } catch (x) { if (x && /cancel|dismiss/i.test(String(x.message || x))) return; }
  try { /* browser mobile con condivisione file */
    const f = new File([testo], nome, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: nome }); return; }
  } catch (x) { if (x && x.name === 'AbortError') return; }
  try { /* download classico */
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([testo], { type: 'application/json' })); a.download = nome; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); return;
  } catch (x) {}
  copiaTesto(testo);
}
function copiaTesto(t) { (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => alert('Dati copiati negli appunti: incollali in una nota o in un messaggio per conservarli.'), () => prompt('Copia questo testo e conservalo:', t)); }
function vDati() {
  titolo.textContent = 'Dati e installazione';
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  app.innerHTML = `<div class="card"><h2>Installa l'app</h2>${installEv ? '<button class="b" id="inst">Installa sul telefono</button>' : ''}
    <div class="mute" style="margin-top:6px">${ios ? '<b>iPhone/iPad (Safari):</b> tocca il tasto Condividi e poi «Aggiungi alla schermata Home».' : '<b>Android (Chrome):</b> menu ⋮ → «Installa app» (o «Aggiungi a schermata Home»).'}
    Dopo l'installazione funziona anche senza rete.</div></div>
    <div class="card"><h2>Copia di sicurezza</h2><div class="mute">I dati sono solo su questo telefono: salva ogni tanto una copia e conservala. Cancellando i dati del browser o disinstallando l'app senza copia, si perdono.</div>
    <div style="height:8px"></div><button class="b sec" id="bk">Salva copia dei dati (file)</button><div style="height:8px"></div><button class="b sec" id="cp">Copia i dati negli appunti</button><div style="height:8px"></div><button class="b sec" id="rs">Ripristina da copia (file)</button><div style="height:8px"></div><button class="b sec" id="rt">Ripristina da testo incollato</button><input type="file" id="rsf" accept=".json" style="display:none">
    <div style="height:8px"></div><button class="b ko" id="rz">Cancella tutti i dati</button></div>`;
  const i = $('#inst'); if (i) i.onclick = async () => { installEv.prompt(); await installEv.userChoice; installEv = null; vDati(); };
  $('#bk').onclick = () => scarica('diario_copia_' + dkey(new Date()) + '.json', JSON.stringify(S));
  $('#cp').onclick = () => copiaTesto(JSON.stringify(S));
  $('#rt').onclick = () => { const t = prompt('Incolla qui il testo della copia dei dati:'); if (!t) return; try { const o = JSON.parse(t); if (!o.attivita || !o.listino) throw new Error('non è una copia del Diario'); if (confirm('Sostituire i dati attuali con la copia?')) { S = Object.assign(defState(), o); save(); alert('Dati ripristinati.'); nav('#/'); } } catch (x) { alert('Testo non valido: ' + x.message); } };
  $('#rs').onclick = () => $('#rsf').click();
  $('#rsf').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { const o = JSON.parse(await f.text()); if (!o.attivita || !o.listino) throw new Error('non è una copia del Diario'); if (confirm('Sostituire i dati attuali con la copia?')) { S = Object.assign(defState(), o); save(); alert('Dati ripristinati.'); nav('#/'); } } catch (x) { alert('File non valido: ' + x.message); } };
  $('#rz').onclick = () => { if (confirm('Cancellare tutte le attività e il profilo?') && confirm('Sei sicuro? L\'operazione non si può annullare.')) { S = defState(); save(); nav('#/'); } };
}

load(); route();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
