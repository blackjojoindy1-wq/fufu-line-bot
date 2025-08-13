// LINE Booking Bot – Multilingual Registration Card (Final app.js)
// -----------------------------------------------------------------
// ✅ Starts ONLY when user types: "book" (EN), "จอง" (TH), or "予約" (JP)
// ✅ First-time add (follow): sends one start hint only (no spam)
// ✅ After ✅ Confirm: sends pending note + plain-text summary +
//    a multilingual **Flex card** titled "New Customer Registration" with branch-specific button
// ✅ Button opens the correct registration form by branch (Thong Lo / Phrom Phong)
// ✅ Confirm button reliability fix: vertical footer + displayText + robust postback parser
// ✅ Ignores random messages after completion (no repeated summaries)

const express = require('express');
const line = require('@line/bot-sdk');

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

const client = new line.Client(config);
const app = express();

// In-memory state (replace with DB for production)
const userState = new Map();

const TRIGGER_REGEX = /(^|\s)(book|จอง|予約)(\s|$)/i;

const MENUS = {
  THONGLOR: 'https://fufuhaircolor.com/thong-lo-%7C-menu',
  PHROMPHONG: 'https://fufuhaircolor.com/phrom-phong-%7C-menu',
};

const REG_FORMS = {
  THONGLOR: 'https://forms.gle/pSEPMK6E77a9XTKZ8',
  PHROMPHONG: 'https://forms.gle/bmNKyN6Yo4w8poN76',
};

function baseState() {
  return { lang: null, branch: null, date: null, time: null, service: null, name: null, phone: null, discount: null, completed: false };
}
function getUser(id) { if (!userState.has(id)) userState.set(id, baseState()); return userState.get(id); }
function resetUser(id) { userState.set(id, baseState()); return userState.get(id); }

function t(lang, key) {
  const copy = {
    START_HINT: { EN: "Hi! Type 'book' to start a booking. / พิมพ์ 'จอง' เพื่อเริ่มจอง / '予約' で開始", JP: "こんにちは！ 'book' または '予約' と送ると予約が開始します。/ 'จอง' でもOK", TH: "สวัสดีค่ะ! พิมพ์คำว่า 'จอง' หรือ 'book' เพื่อเริ่มจองได้เลย / พิมพ์ '予約' ก็ได้" },
    GREET: { EN: 'Hello! Please select your preferred language.', JP: 'こんにちは！ご希望の言語をお選びください。', TH: 'สวัสดีค่ะ! กรุณาเลือกภาษาที่ต้องการค่ะ' },
    CHOOSE_BRANCH: { EN: 'Please choose your preferred branch.', JP: 'ご希望のブランチをお選びください。', TH: 'กรุณาเลือกสาขาที่ต้องการค่ะ' },
    BRANCH_THONGLOR: { EN: 'Thong Lo', JP: 'Thong Lo', TH: 'ทองหล่อ' },
    BRANCH_PHROMPHONG: { EN: 'Phrom Phong', JP: 'Phrom Phong', TH: 'พร้อมพงษ์' },
    ASK_DATE: { EN: 'Please select the date that works best for you.', JP: 'ご都合の良い日付をお選びください。', TH: 'กรุณาเลือกวันที่ที่สะดวกที่สุดค่ะ' },
    ASK_TIME: { EN: 'Please select the time that works best for you.', JP: 'ご都合の良い時間をお選びください。', TH: 'กรุณาเลือกเวลาที่สะดวกที่สุดค่ะ' },
    ASK_SERVICE: { EN: 'Which hair service or treatment would you like to do?', JP: 'ご希望のヘアサービスやトリートメントをお知らせください。', TH: 'ต้องการทำบริการทำผมหรือทรีตเมนต์แบบไหนคะ?' },
    NEED_MENU: { EN: 'If you need to see our menu, please tell us your preferred branch.', JP: 'メニューをご覧になりたい場合は、ご希望のブランチを教えてください。', TH: 'หากต้องการดูเมนู กรุณาแจ้งสาขาที่ต้องการก่อนค่ะ' },
    ASK_NAME: { EN: 'Please provide your name in English.', JP: '英語でお名前をご記入ください。', TH: 'กรุณากรอกชื่อเป็นภาษาอังกฤษค่ะ' },
    ASK_PHONE: { EN: 'Please provide your contact number.', JP: 'ご連絡先の電話番号をご記入ください。', TH: 'กรุณากรอกหมายเลขโทรศัพท์ที่ติดต่อได้ค่ะ' },
    ASK_DISCOUNT: { EN: 'Any discount or promotion code to use? (Optional)', JP: 'ご利用の割引・プロモーションコードはありますか？（任意）', TH: 'มีโค้ดส่วนลดหรือโปรโมชันต้องการใช้ไหมคะ (ไม่บังคับ)' },
    NO_DISCOUNT_LABEL: { EN: 'No discount', JP: '割引なし', TH: 'ไม่ใช้ส่วนลด' },
    CONFIRM_TITLE: { EN: 'Please confirm your booking details', JP: 'ご予約内容のご確認', TH: 'กรุณายืนยันรายละเอียดการจองค่ะ' },
    RECEIVED_PENDING: { EN: "We've received your booking request. We will check availability and reconfirm with you shortly.", JP: 'ご予約リクエストを受け付けました。空き状況を確認し、追ってご連絡いたします。', TH: 'เราได้รับคำขอจองของคุณแล้ว จะตรวจสอบคิวและยืนยันกลับให้โดยเร็วค่ะ' },
    SUMMARY_TITLE: { EN: 'Booking summary', JP: 'ご予約サマリー', TH: 'สรุปรายละเอียดการจอง' },
    // Registration card (multilingual)
    REG_TITLE: { EN: 'New Customer Registration', JP: '新規のお客様登録', TH: 'ลงทะเบียนลูกค้าใหม่' },
    REG_NOTE: { EN: 'Please fill in if New Customer.', JP: '新規のお客様のみご記入ください。', TH: 'หากเป็นลูกค้าใหม่ กรุณากรอกแบบฟอร์ม' },
    REG_BTN: { EN: 'Open Registration Form', JP: '登録フォームを開く', TH: 'เปิดแบบฟอร์มลงทะเบียน' },
  };
  return copy[key][lang || 'EN'];
}

// ---------- Builders ----------
function quickReplyLanguage() { return { type: 'text', text: 'Select language / 言語を選択 / เลือกภาษา', quickReply: { items: [ { type: 'action', action: { type: 'postback', label: 'English', data: 'lang=EN' } }, { type: 'action', action: { type: 'postback', label: '日本語', data: 'lang=JP' } }, { type: 'action', action: { type: 'postback', label: 'ไทย', data: 'lang=TH' } } ] } }; }
function quickReplyBranch(lang) { return { type: 'text', text: t(lang, 'CHOOSE_BRANCH'), quickReply: { items: [ { type: 'action', action: { type: 'postback', label: t(lang, 'BRANCH_THONGLOR'), data: 'branch=THONGLOR' } }, { type: 'action', action: { type: 'postback', label: t(lang, 'BRANCH_PHROMPHONG'), data: 'branch=PHROMPHONG' } } ] } };
}
function quickReplyDate(lang) { return { type: 'text', text: t(lang, 'ASK_DATE'), quickReply: { items: [ { type: 'action', action: { type: 'datetimepicker', label: 'Pick date', data: 'pick=date', mode: 'date' } } ] } }; }
function quickReplyTime(lang) { return { type: 'text', text: t(lang, 'ASK_TIME'), quickReply: { items: [ { type: 'action', action: { type: 'postback', label: '10:00', data: 'time=10:00' } }, { type: 'action', action: { type: 'postback', label: '13:00', data: 'time=13:00' } }, { type: 'action', action: { type: 'postback', label: '16:00', data: 'time=16:00' } }, { type: 'action', action: { type: 'postback', label: 'Other', data: 'time=OTHER' } } ] } }; }
function askService(lang) { return { type: 'text', text: `${t(lang, 'ASK_SERVICE')}\n\n${t(lang, 'NEED_MENU')}`, quickReply: { items: [ { type: 'action', action: { type: 'message', label: 'Color', text: 'Color' } }, { type: 'action', action: { type: 'message', label: 'Bleach on Color', text: 'Bleach on Color' } }, { type: 'action', action: { type: 'message', label: 'Treatment', text: 'Treatment' } }, { type: 'action', action: { type: 'message', label: 'Menu', text: 'Menu' } } ] } }; }
function askName(lang) { return { type: 'text', text: t(lang, 'ASK_NAME') }; }
function askPhone(lang) { return { type: 'text', text: t(lang, 'ASK_PHONE') }; }
function askDiscount(lang) { const noLabel = t(lang, 'NO_DISCOUNT_LABEL'); return { type: 'text', text: t(lang, 'ASK_DISCOUNT'), quickReply: { items: [ { type: 'action', action: { type: 'message', label: noLabel, text: '-' } } ] } }; }

function showMenuForBranch(lang, branch) { const url = branch === 'THONGLOR' ? MENUS.THONGLOR : MENUS.PHROMPHONG; return { type: 'text', text: `${t(lang, 'NEED_MENU')}\n${url}` }; }

function buildSummaryText(lang, s) { const branchLabel = s.branch === 'THONGLOR' ? t(lang, 'BRANCH_THONGLOR') : t(lang, 'BRANCH_PHROMPHONG'); return `${t(lang, 'SUMMARY_TITLE')}\n` + `Branch: ${branchLabel}\n` + `Date: ${s.date || '-'}\n` + `Time: ${s.time || '-'}\n` + `Service: ${s.service || '-'}\n` + `Name: ${s.name || '-'}\n` + `Phone: ${s.phone || '-'}\n` + `Discount: ${s.discount || '-'}`; }

function confirmationFlex(lang, s) {
  const branchLabel = s.branch === 'THONGLOR' ? t(lang, 'BRANCH_THONGLOR') : t(lang, 'BRANCH_PHROMPHONG');
  return { type: 'flex', altText: t(lang, 'CONFIRM_TITLE'), contents: { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: t(lang, 'CONFIRM_TITLE'), weight: 'bold', size: 'md' }] }, body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [ { type: 'box', layout: 'baseline', contents: [{ type: 'text', text: 'Branch', flex: 2 }, { type: 'text', text: branchLabel, flex: 5 }] }, { type: 'box', layout: 'baseline', contents: [{ type: 'text', text: 'Date', flex: 2 }, { type: 'text', text: s.date || '-', flex: 5 }] }, { type: 'box', layout: 'baseline', contents: [{ type: 'text', text: 'Time', flex: 2 }, { type: 'text', text: s.time || '-', flex: 5 }] }, { type: 'box', layout: 'baseline', contents: [{ type: 'text', text: 'Service', flex: 2 }, { type: 'text', text: s.service || '-', flex: 5 }] }, { type: 'box', layout: 'baseline', contents: [{ type: 'text', text: 'Name', flex: 2 }, { type: 'text', text: s.name || '-', flex: 5 }] }, { type: 'box', layout: 'baseline', contents: [{ type: 'text', text: 'Phone', flex: 2 }, { type: 'text', text: s.phone || '-', flex: 5 }] }, { type: 'box', layout: 'baseline', contents: [{ type: 'text', text: 'Discount', flex: 2 }, { type: 'text', text: s.discount || '-', flex: 5 }] } ] }, footer: { type: 'box', layout: 'vertical', spacing: 'md', contents: [ { type: 'button', style: 'primary', action: { type: 'postback', label: '✅ Confirm', data: 'action=confirm&value=YES', displayText: 'Confirm' } }, { type: 'button', style: 'secondary', action: { type: 'postback', label: '✏️ Edit', data: 'action=confirm&value=EDIT', displayText: 'Edit' } } ] } } };
}

function registrationCard(lang, branch) {
  const url = branch === 'THONGLOR' ? REG_FORMS.THONGLOR : REG_FORMS.PHROMPHONG;
  const branchLabel = branch === 'THONGLOR' ? t(lang, 'BRANCH_THONGLOR') : t(lang, 'BRANCH_PHROMPHONG');
  return { type: 'flex', altText: t(lang, 'REG_TITLE'), contents: { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [ { type: 'text', text: t(lang, 'REG_TITLE'), weight: 'bold', size: 'lg' }, { type: 'text', text: branchLabel, size: 'sm', color: '#888' } ] }, body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [ { type: 'text', text: t(lang, 'REG_NOTE') } ] }, footer: { type: 'box', layout: 'vertical', contents: [ { type: 'button', style: 'primary', action: { type: 'uri', label: t(lang, 'REG_BTN'), uri: url } } ] } } };
}

// ---------- Webhook ----------
app.post('/callback', line.middleware(config), async (req, res) => {
  try { const results = await Promise.all(req.body.events.map(handleEvent)); res.json(results); } catch (e) { console.error(e); res.status(500).end(); }
});

async function handleEvent(event) {
  const userId = event.source.userId || 'unknown';
  const s = getUser(userId);

  if (event.type === 'follow') {
    return client.replyMessage(event.replyToken, [{ type: 'text', text: t('EN', 'START_HINT') }]);
  }

  if (event.type === 'postback') {
    const data = parsePostback(event.postback.data);

    if (data.lang) { s.lang = data.lang; return client.replyMessage(event.replyToken, [ { type: 'text', text: t(s.lang, 'GREET') }, quickReplyBranch(s.lang) ]); }
    if (data.branch) { s.branch = data.branch; return client.replyMessage(event.replyToken, [ quickReplyDate(s.lang) ]); }
    if (data.pick === 'date' && event.postback.params?.date) { s.date = event.postback.params.date; return client.replyMessage(event.replyToken, [ quickReplyTime(s.lang) ]); }
    if (data.time) { if (data.time === 'OTHER') return client.replyMessage(event.replyToken, [{ type: 'text', text: t(s.lang, 'ASK_TIME') + ' (Please type your preferred time)' }]); s.time = data.time; return client.replyMessage(event.replyToken, [ askService(s.lang) ]); }

    const confirmVal = (data.action === 'confirm') ? data.value : data.confirm;
    if (confirmVal === 'YES') {
      s.completed = true;
      const msgs = [ { type: 'text', text: t(s.lang, 'RECEIVED_PENDING') }, { type: 'text', text: buildSummaryText(s.lang, s) }, registrationCard(s.lang || 'EN', s.branch || 'THONGLOR') ];
      return client.replyMessage(event.replyToken, msgs);
    }
    if (confirmVal === 'EDIT') { return client.replyMessage(event.replyToken, [ quickReplyBranch(s.lang) ]); }
    return null;
  }

  if (event.type === 'message' && event.message.type === 'text') {
    const textRaw = (event.message.text || '').trim();

    if (TRIGGER_REGEX.test(textRaw)) { resetUser(userId); return client.replyMessage(event.replyToken, [ quickReplyLanguage() ]); }

    if (/\bmenu\b/i.test(textRaw) || /メニュー/.test(textRaw) || /เมนู/.test(textRaw)) {
      if (!s.branch) return client.replyMessage(event.replyToken, [ { type: 'text', text: t(s.lang || 'EN', 'NEED_MENU') }, quickReplyBranch(s.lang || 'EN') ]);
      return client.replyMessage(event.replyToken, [ showMenuForBranch(s.lang || 'EN', s.branch) ]);
    }

    if (!s.lang && !s.branch && !s.date && !s.time && !s.service) { return null; }

    if (!s.branch) return client.replyMessage(event.replyToken, [ quickReplyBranch(s.lang || 'EN') ]);
    if (!s.date) return client.replyMessage(event.replyToken, [ quickReplyDate(s.lang || 'EN') ]);
    if (!s.time) { if (/^\d{1,2}:\d{2}$/.test(textRaw)) { s.time = textRaw; return client.replyMessage(event.replyToken, [ askService(s.lang || 'EN') ]); } return client.replyMessage(event.replyToken, [ quickReplyTime(s.lang || 'EN') ]); }
    if (!s.service) { s.service = textRaw; return client.replyMessage(event.replyToken, [ askName(s.lang || 'EN') ]); }
    if (!s.name) { s.name = textRaw; return client.replyMessage(event.replyToken, [ askPhone(s.lang || 'EN') ]); }
    if (!s.phone) { s.phone = textRaw; return client.replyMessage(event.replyToken, [ askDiscount(s.lang || 'EN') ]); }
    if (!s.discount) { const text = textRaw.toLowerCase(); const noWords = ['no', 'none', 'skip', '-', 'なし', 'ไม่ใช้', 'ไม่ใช้ส่วนลด', 'ไม่มี']; s.discount = noWords.includes(text) ? '' : textRaw; return client.replyMessage(event.replyToken, [ confirmationFlex(s.lang || 'EN', s) ]); }

    if (s.completed) { return null; }
  }
  return null;
}

function parsePostback(data) {
  if (!data) return {};
  try { const params = new URLSearchParams(data); const out = {}; for (const [k, v] of params.entries()) out[k] = v; return out; }
  catch (e) { const out = {}; (data || '').split('&').forEach(p => { const [k, v] = p.split('='); if (k) out[k] = decodeURIComponent(v || ''); }); return out; }
}

const PORT = process.env.PORT || 3000; app.listen(PORT, () => console.log('LINE bot listening on ' + PORT));
