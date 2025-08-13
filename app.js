// Paste THIS into app.js on GitHub if following the deployment guide
// This is the full LINE Booking Bot code that connects to the LINE API
// (Code from earlier "LINE Booking Bot – Quick Replies (Node.js)" canvas)

const express = require('express');
const line = require('@line/bot-sdk');

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

const client = new line.Client(config);
const app = express();

// In-memory state store (replace with DB in production)
const userState = new Map();

const MENUS = {
  THONGLOR: 'https://fufuhaircolor.com/thong-lo-%7C-menu',
  PHROMPHONG: 'https://fufuhaircolor.com/phrom-phong-%7C-menu',
};

const REGISTRATION_FORM_URL = process.env.REGISTRATION_FORM_URL || '<<PASTE_YOUR_REGISTRATION_FORM_URL>>';

const LANGS = { EN: 'EN', JP: 'JP', TH: 'TH' };

function getUser(ctx) {
  if (!userState.has(ctx)) userState.set(ctx, {});
  return userState.get(ctx);
}

function t(lang, key) {
  const copy = {
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
    CONFIRMED: { EN: 'Thank you! Your booking request has been received. Please fill out the Customer Registration Form: ', JP: 'ありがとうございます！ご予約リクエストを受け付けました。お客様登録フォームにご記入ください：', TH: 'ขอบคุณค่ะ! ระบบได้รับคำขอจองของคุณแล้ว กรุณากรอกแบบฟอร์มลงทะเบียนลูกค้า: ' },
    CONSULT: { EN: '\nYou can consult our colorists here in the chat anytime before or after your visit.', JP: '\nご来店の前後を問わず、いつでもこのチャットでカラーリストにご相談いただけます。', TH: '\nสามารถปรึกษาคัลเลอร์ริสต์ของเราได้ตลอดเวลาในแชทนี้ ทั้งก่อนและหลังเข้ารับบริการค่ะ' },
    SHOW_MENU: { EN: 'Here is the menu for your selected branch:', JP: '選択したブランチのメニューはこちらです：', TH: 'นี่คือเมนูของสาขาที่คุณเลือกค่ะ:' },
  };
  return copy[key][lang];
}

function quickReplyLanguage() {
  return { type: 'text', text: 'Select language / 言語を選択 / เลือกภาษา', quickReply: { items: [ { type: 'action', action: { type: 'postback', label: 'English', data: 'lang=EN' } }, { type: 'action', action: { type: 'postback', label: '日本語', data: 'lang=JP' } }, { type: 'action', action: { type: 'postback', label: 'ไทย', data: 'lang=TH' } } ] } };
}

function quickReplyBranch(lang) {
  return { type: 'text', text: t(lang, 'CHOOSE_BRANCH'), quickReply: { items: [ { type: 'action', action: { type: 'postback', label: t(lang, 'BRANCH_THONGLOR'), data: 'branch=THONGLOR' } }, { type: 'action', action: { type: 'postback', label: t(lang, 'BRANCH_PHROMPHONG'), data: 'branch=PHROMPHONG' } } ] } };
}

function quickReplyDate(lang) {
  return { type: 'text', text: t(lang, 'ASK_DATE'), quickReply: { items: [ { type: 'action', action: { type: 'datetimepicker', label: 'Pick date', data: 'pick=date', mode: 'date' } } ] } };
}

function quickReplyTime(lang) {
  return { type: 'text', text: t(lang, 'ASK_TIME'), quickReply: { items: [ { type: 'action', action: { type: 'postback', label: '10:00', data: 'time=10:00' } }, { type: 'action', action: { type: 'postback', label: '13:00', data: 'time=13:00' } }, { type: 'action', action: { type: 'postback', label: '16:00', data: 'time=16:00' } }, { type: 'action', action: { type: 'postback', label: 'Other', data: 'time=OTHER' } } ] } };
}

function askService(lang) {
  return { type: 'text', text: `${t(lang, 'ASK_SERVICE')}\n\n${t(lang, 'NEED_MENU')}`, quickReply: { items: [ { type: 'action', action: { type: 'message', label: 'Color', text: 'Color' } }, { type: 'action', action: { type: 'message', label: 'Bleach on Color', text: 'Bleach on Color' } }, { type: 'action', action: { type: 'message', label: 'Treatment', text: 'Treatment' } }, { type: 'action', action: { type: 'message', label: 'Menu', text: 'Menu' } } ] } };
}

function askName(lang) { return { type: 'text', text: t(lang, 'ASK_NAME') }; }
function askPhone(lang) { return { type: 'text', text: t(lang, 'ASK_PHONE') }; }
function askDiscount(lang) { return { type: 'text', text: t(lang, 'ASK_DISCOUNT') }; }

function showMenuForBranch(lang, branch) {
  const url = branch === 'THONGLOR' ? MENUS.THONGLOR : MENUS.PHROMPHONG;
  return { type: 'text', text: `${t(lang, 'SHOW_MENU')}\n${url}` };
}

app.post('/callback', line.middleware(config), async (req, res) => {
  try { const results = await Promise.all(req.body.events.map(handleEvent)); res.json(results); } catch (e) { console.error(e); res.status(500).end(); }
});

async function handleEvent(event) {
  const userId = event.source.userId || 'unknown';
  const state = getUser(userId);

  if (event.type === 'follow') return client.replyMessage(event.replyToken, [quickReplyLanguage()]);

  if (event.type === 'postback') {
    const data = parseQuery(event.postback.data);
    if (data.lang) { state.lang = data.lang; return client.replyMessage(event.replyToken, [{ type: 'text', text: t(state.lang, 'GREET') }, quickReplyBranch(state.lang)]); }
    if (data.branch) { state.branch = data.branch; return client.replyMessage(event.replyToken, [quickReplyDate(state.lang)]); }
    if (data.pick === 'date' && event.postback.params?.date) { state.date = event.postback.params.date; return client.replyMessage(event.replyToken, [quickReplyTime(state.lang)]); }
    if (data.time) { if (data.time === 'OTHER') return client.replyMessage(event.replyToken, [{ type: 'text', text: t(state.lang, 'ASK_TIME') + ' (Please type your preferred time)' }]); state.time = data.time; return client.replyMessage(event.replyToken, [askService(state.lang)]); }
    return null;
  }

  if (event.type === 'message' && event.message.type === 'text') {
    const text = event.message.text.trim();
    if (/\bmenu\b/i.test(text) || /メニュー/.test(text) || /เมนู/.test(text)) {
      if (!state.branch) return client.replyMessage(event.replyToken, [{ type: 'text', text: t(state.lang || 'EN', 'NEED_MENU') }, quickReplyBranch(state.lang || 'EN')]);
      return client.replyMessage(event.replyToken, [showMenuForBranch(state.lang || 'EN', state.branch)]);
    }
    if (!state.lang) return client.replyMessage(event.replyToken, [quickReplyLanguage()]);
    if (!state.branch) return client.replyMessage(event.replyToken, [quickReplyBranch(state.lang)]);
    if (!state.date) return client.replyMessage(event.replyToken, [quickReplyDate(state.lang)]);
    if (!state.time) { if (/^\d{1,2}:\d{2}$/.test(text)) { state.time = text; return client.replyMessage(event.replyToken, [askService(state.lang)]); } return client.replyMessage(event.replyToken, [quickReplyTime(state.lang)]); }
    if (!state.service) { state.service = text; return client.replyMessage(event.replyToken, [askName(state.lang)]); }
    if (!state.name) { state.name = text; return client.replyMessage(event.replyToken, [askPhone(state.lang)]); }
    if (!state.phone) { state.phone = text; return client.replyMessage(event.replyToken, [askDiscount(state.lang)]); }
    if (!state.discount) { state.discount = text === '-' ? '' : text; return client.replyMessage(event.replyToken, [{ type: 'text', text: t(state.lang, 'CONFIRMED') + REGISTRATION_FORM_URL + t(state.lang, 'CONSULT') }]); }
  }
  return null;
}

function parseQuery(q) { const out = {}; (q || '').split('&').forEach(pair => { const [k, v] = pair.split('='); if (k) out[k] = decodeURIComponent(v || ''); }); return out; }

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('LINE bot listening on ' + PORT));
