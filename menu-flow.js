// Menu Flow Trigger Patch (JS)
// Purpose: Only start the menu flow when user sends "menu"/"メニュー"/"เมนู".
// Then: ask Branch -> ask Menu Category (Coloring / Treatment / Add-ons / Show All).
// Do NOT spam: use per-user cooldown and exact-trigger regex.
// Postbacks are used for branch & category selections to keep the chat clean.

module.exports = function createMenuFlow({ client, priceData }) {
  const MENU_TRIGGERS = [/^\s*(menu|メニュー|เมนู)\s*$/i];
  const COOLDOWN_MS = 15_000; // 15s anti-spam
  const lastMenuAt = new Map(); // userId -> timestamp

  function isMenuTrigger(text) { return MENU_TRIGGERS.some((rx) => rx.test(text || '')); }
  function withinCooldown(userId) { const last = lastMenuAt.get(userId) || 0; return Date.now() - last < COOLDOWN_MS; }
  function touchCooldown(userId) { lastMenuAt.set(userId, Date.now()); }

  function parsePB(data) {
    const out = { _raw: data };
    if (!data || !data.startsWith('menu')) return out;
    data.split('|').slice(1).forEach((kv) => { const [k, v] = kv.split('='); out[k] = v; });
    return out;
  }

  async function onText(event) {
    const userId = event.source.userId || 'anon';
    const text = (event.message && event.message.text) || '';
    if (!isMenuTrigger(text)) return false; // NOT handled → let other logic run
    if (withinCooldown(userId)) return true; // handled (silently) to prevent spam
    touchCooldown(userId);
    await askBranch(event.replyToken);
    return true; // handled
  }

  async function onPostback(event) {
    const pb = parsePB(event.postback && event.postback.data);
    if (!pb || !pb._raw || !pb._raw.startsWith('menu')) return false; // not for us

    if (pb.branch && !pb.cat) { await askCategory(event.replyToken, pb.branch); return true; }

    if (pb.branch && pb.cat && !pb.len) {
      if (pb.cat === 'all') { await showAllSections(event.replyToken, pb.branch); return true; }
      if (pb.cat === 'coloring' || pb.cat === 'addons') { await askLength(event.replyToken, pb.branch, pb.cat); }
      else { await showSection(event.replyToken, pb.branch, pb.cat, null); }
      return true;
    }

    if (pb.branch && pb.cat && pb.len) { await showSection(event.replyToken, pb.branch, pb.cat, pb.len); return true; }
    return false;
  }

  async function askBranch(replyToken) {
    return client.replyMessage(replyToken, {
      type: 'text',
      text: 'Choose a branch / เลือกสาขา / 店舗を選択',
      quickReply: { items: [ qrPB('Thong Lo / ทองหล่อ', 'menu|branch=THONGLO'), qrPB('Phrom Phong / พร้อมพงษ์', 'menu|branch=PHROMPHONG') ] }
    });
  }

  async function askCategory(replyToken, branch) {
    return client.replyMessage(replyToken, {
      type: 'text',
      text: 'Which menu? (Coloring / Treatment / Add-ons / Show All)',
      quickReply: { items: [ qrPB('Color Menu', `menu|branch=${branch}|cat=coloring`), qrPB('Treatment Menu', `menu|branch=${branch}|cat=treatment`), qrPB('Add-ons', `menu|branch=${branch}|cat=addons`), qrPB('Show All', `menu|branch=${branch}|cat=all`) ] }
    });
  }

  async function askLength(replyToken, branch, cat) {
    const lengths = (priceData.branches[branch] && priceData.branches[branch].lengths) || [];
    const labels = { RET: 'Retouch (roots)', S: 'S – Not beyond jawline', M: 'M – Not beyond collarbone', L: 'L – Beyond collarbone', XL: 'XL – Mid-back downward' };
    return client.replyMessage(replyToken, {
      type: 'text', text: 'Select hair length',
      quickReply: { items: lengths.map((len) => qrPB(labels[len] || len, `menu|branch=${branch}|cat=${cat}|len=${len}`)) }
    });
  }

  async function showAllSections(replyToken, branch) {
    return client.replyMessage(replyToken, { type: 'text', text: 'All menus for this branch:', quickReply: { items: [ qrPB('Coloring', `menu|branch=${branch}|cat=coloring`), qrPB('Treatment', `menu|branch=${branch}|cat=treatment`), qrPB('Add-ons', `menu|branch=${branch}|cat=addons`) ] } });
  }

  async function showSection(replyToken, branch, cat, len) {
    const section = priceData.sections.find((s) => s.id === cat);
    if (!section) return client.replyMessage(replyToken, { type: 'text', text: 'Menu not found.' });

    const note = priceData.display_rules?.note || 'Final bill will include 7% VAT and 10% service fee.';
    const unavailableNote = priceData.display_rules?.unavailable_note || 'Not available at this branch';

    const lines = section.items.map((it) => {
      const bp = it.branch_prices && it.branch_prices[branch];
      if (!bp) return `• ${nameOf(it)} — ${unavailableNote}`;
      if (bp.unavailable) return `• ${nameOf(it)} — ${unavailableNote}`;

      if (it.per_length) {
        if (!len) return `• ${nameOf(it)} — choose hair length first`;
        const price = bp[len];
        if (typeof price === 'number' && price > 0) {
          return `• ${nameOf(it)} — ${fmt(price)} THB  (${note})`;
        }
        return `• ${nameOf(it)} — ${unavailableNote}`;
      }

      if (typeof bp.flat === 'number') { return `• ${nameOf(it)} — ${fmt(bp.flat)} THB  (${note})`; }
      return `• ${nameOf(it)} — ${unavailableNote}`;
    });

    return client.replyMessage(replyToken, { type: 'text', text: lines.join('\n') });
  }

  function qrPB(label, data) { return { type: 'action', action: { type: 'postback', label, data, displayText: label } }; }
  function fmt(n) { return new Intl.NumberFormat('en-US').format(n); }
  function nameOf(it) { return it.name_en || it.id; }

  return { onText, onPostback };
}
