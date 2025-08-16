/**
 * LINE Booking Bot – Quick Replies (Node.js) + Menu Flow (Exact Trigger)
 * ------------------------------------------------------------
 * Additions in this merged version:
 * - Menu flow triggers ONLY on: "menu", "メニュー", "เมนู" (exact match, case-insensitive)
 * - Branch → Category (Coloring / Treatment / Add-ons / Show All) → (Length for per-length)
 * - Reads base prices from fufu-menu-master.json and shows unavailable items with a note
 * - 15s anti-spam cooldown for menu trigger
 * - Booking flow remains on "book" / "จอง" / "予約" and will not be spammed by menu
 */

const express = require('express');
const bodyParser = require('body-parser');
const { Client, validateSignature } = require('@line/bot-sdk');

// ----- Config -----
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new Client(config);
const app = express();
app.use(bodyParser.json({ verify: rawBodySaver }));

function rawBodySaver(req, res, buf) { req.rawBody = buf; }

// Health check
app.get('/', (req, res) => res.status(200).send('fufu LINE Booking Bot is running'));

// Load menu JSON (base prices; marks unavailable per branch)
let priceData;
try {
  priceData = require('./fufu-menu-master.json');
} catch (e) {
  console.error('Failed to load fufu-menu-master.json:', e.message);
  priceData = { branches: {}, sections: [], display_rules: {} };
}

// Menu flow (only triggers on "menu" / "メニュー" / "เมนู")
const menuFlow = require('./menu-flow')({ client, priceData });

// Verify LINE signature manually to avoid accidental 200s
app.post('/webhook', (req, res) => {
  const signature = req.headers['x-line-signature'];
  if (!validateSignature(req.rawBody, config.channelSecret, signature)) {
    return res.status(401).send('Unauthorized');
  }
  Promise
    .all((req.body.events || []).map(handleEvent))
    .then(() => res.status(200).end())
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

// ----- In-memory session store -----
const SESSIONS = new Map();
const DONE_USERS = new Set(); // to prevent resending summaries for later messages

function getSession(userId) {
  if (!SESSIONS.has(userId)) {
    SESSIONS.set(userId, {
      lang: null,           // 'en' | 'th' | 'ja'
      step: null,           // current step key
      data: {               // collected fields
        branch: null,       // 'Thong Lo' | 'Phrom Phong'
        date: null,         // YYYY-MM-DD
        time: null,         // HH:MM
        menu: null,         // text
        name: null,         // text (English)
        phone: null,        // digits
        discount: null,     // text (optional)
      },
      started: false,
      completed: false,
    });
  }
  return SESSIONS.get(userId);
}

function resetSession(userId) { SESSIONS.delete(userId); }

// ----- Localization (GUI text only) -----
const T = {
  en: {
    consult_anytime: "You can chat here to consult our colorists anytime.",
    start_title: "Welcome to fufu Hair Color Salon",
    start_howto: "Type 'book' to start your booking in English, 日本語, or ไทย.",
    pick_language: "Choose your language",
    pick_branch: "Which branch would you like?",
    thonglo: "Thong Lo",
    phromphong: "Phrom Phong",
    pick_date: "Pick your preferred DATE",
    pick_time: "Pick your preferred TIME",
    pick_menu: "Which hair menu/treatment would you like?",
    see_menu: "See Menu",
    menu_note: "You can view the menu via the button below.",
    thonglo_menu: "Thong Lo Menu",
    phromphong_menu: "Phrom Phong Menu",
    ask_name: "What is your name (English)?",
    ask_phone: "What is your contact phone number?",
    ask_discount: "Any discount code or program to use? (type 'no' if none)",
    confirm_title: "Please confirm your booking details",
    confirm_button: "Confirm Booking",
    change_button: "Start Over",
    received_title: "Booking received",
    received_body: "We will check availability and confirm shortly.",
    summary_header: "Booking Summary",
    registration_header: "New Customer Registration",
    registration_desc: "If you are NEW, please complete registration. Existing customers do not need to register again.",
    register_thonglo: "Register – Thong Lo",
    register_phromphong: "Register – Phrom Phong",
    done_hint: "Thank you! If you have questions, our colorists are here to help anytime.",
  },
  th: {
    consult_anytime: "หากมีข้อสงสัย ปรึกษาช่างสีผมได้ตลอดเวลาที่แชตนี้นะคะ",
    start_title: "ยินดีต้อนรับสู่ fufu Hair Color Salon",
    start_howto: "พิมพ์คำว่า 'จอง' เพื่อเริ่มการจอง (รองรับ English / 日本語 / ไทย)",
    pick_language: "กรุณาเลือกภาษา",
    pick_branch: "ต้องการจองสาขาไหนคะ?",
    thonglo: "ทองหล่อ",
    phromphong: "พร้อมพงษ์",
    pick_date: "กรุณาเลือกวันที่ที่สะดวก",
    pick_time: "กรุณาเลือกเวลาที่สะดวก",
    pick_menu: "ต้องการทำบริการเมนูใดคะ?",
    see_menu: "ดูเมนู",
    menu_note: "สามารถกดปุ่มด้านล่างเพื่อดูเมนูได้ค่ะ",
    thonglo_menu: "เมนู ทองหล่อ",
    phromphong_menu: "เมนู พร้อมพงษ์",
    ask_name: "ขอทราบชื่อเป็นภาษาอังกฤษค่ะ",
    ask_phone: "รบกวนเบอร์โทรติดต่อค่ะ",
    ask_discount: "มีโค้ดส่วนลดหรืองานโปรฯ ไหมคะ (พิมพ์ 'ไม่มี' ถ้าไม่มี)",
    confirm_title: "โปรดตรวจสอบรายละเอียดการจอง",
    confirm_button: "ยืนยันการจอง",
    change_button: "เริ่มใหม่",
    received_title: "รับคำขอจองเรียบร้อย",
    received_body: "ทางร้านจะตรวจสอบคิวและยืนยันกลับอีกครั้งค่ะ",
    summary_header: "สรุปการจอง",
    registration_header: "แบบฟอร์มลงทะเบียนลูกค้าใหม่",
    registration_desc: "หากเป็นลูกค้าใหม่ กรุณากรอกแบบฟอร์ม ลูกค้าเก่าไม่ต้องลงทะเบียนซ้ำ ขอบคุณค่ะ",
    register_thonglo: "ลงทะเบียน – ทองหล่อ",
    register_phromphong: "ลงทะเบียน – พร้อมพงษ์",
    done_hint: "ขอบคุณค่ะ หากมีคำถาม ปรึกษาช่างได้ตลอดเวลาที่นี่",
  },
  ja: {
    consult_anytime: "ご不明点は、いつでもこちらのチャットでカラーリストにご相談ください。",
    start_title: "fufu Hair Color Salon へようこそ",
    start_howto: "ご予約は『予約』と入力してください（English / 日本語 / ไทย 対応）",
    pick_language: "言語をお選びください",
    pick_branch: "ご希望の店舗はどちらですか？",
    thonglo: "トンロー店",
    phromphong: "プロンポン店",
    pick_date: "ご希望の日付をお選びください",
    pick_time: "ご希望の時間をお選びください",
    pick_menu: "ご希望のメニュー／トリートメントは？",
    see_menu: "メニューを見る",
    menu_note: "下のボタンからメニューをご確認いただけます。",
    thonglo_menu: "トンロー店メニュー",
    phromphong_menu: "プロンポン店メニュー",
    ask_name: "お名前（英語表記）を教えてください",
    ask_phone: "ご連絡先電話番号を教えてください",
    ask_discount: "割引コードやご利用予定のプロモはありますか？（なければ『なし』）",
    confirm_title: "予約内容をご確認ください",
    confirm_button: "予約を確定",
    change_button: "やり直す",
    received_title: "予約リクエストを受け付けました",
    received_body: "空き状況を確認の上、追ってご連絡いたします。",
    summary_header: "予約内容",
    registration_header: "新規お客様のご登録",
    registration_desc: "新規のお客様はご登録をお願いいたします。既存のお客様は再登録不要です。",
    register_thonglo: "登録 – トンロー店",
    register_phromphong: "登録 – プロンポン店",
    done_hint: "ありがとうございます。ご質問はいつでもお気軽にご相談ください。",
  },
};

// Branch constants & URLs
const BRANCH = {
  THONGLO: 'Thong Lo',
  PHROMPHONG: 'Phrom Phong',
};
const MENU_URL = {
  [BRANCH.THONGLO]: 'https://fufuhaircolor.com/thong-lo-%7C-menu',
  [BRANCH.PHROMPHONG]: 'https://fufuhaircolor.com/phrom-phong-%7C-menu',
};
const REG_URL = {
  [BRANCH.THONGLO]: 'https://forms.gle/pSEPMK6E77a9XTKZ8',
  [BRANCH.PHROMPHONG]: 'https://forms.gle/bmNKyN6Yo4w8poN76',
};

// Triggers to begin booking
const TRIGGERS = [/^book$/i, /^จอง$/i, /^予約$/];

// ----- Event handler -----
async function handleEvent(event) {
  const type = event.type;
  const userId = event.source?.userId;
  if (!userId) return Promise.resolve(null);

  // 0) Menu flow intercept (exact-trigger + postbacks)
  if (type === 'message' && event.message.type === 'text') {
    const handled = await menuFlow.onText(event);
    if (handled) return;
  }
  if (type === 'postback') {
    const handled = await menuFlow.onPostback(event);
    if (handled) return;
  }

  // 1) On first add: one-time how-to-book reminder
  if (type === 'follow') {
    const lang = 'en';
    const t = T[lang];
    return client.replyMessage(event.replyToken, [
      text(`${t.start_title}\n${t.start_howto}`),
      text(t.consult_anytime),
    ]);
  }

  if (type !== 'message' && type !== 'postback') return Promise.resolve(null);

  const session = getSession(userId);

  // 2) Booking trigger words
  if (type === 'message' && event.message.type === 'text') {
    const msg = (event.message.text || '').trim();
    if (TRIGGERS.some((re) => re.test(msg))) {
      DONE_USERS.delete(userId); // user wants a new booking
      resetSession(userId);
      const s = getSession(userId);
      s.started = true;
      s.step = 'pick_language';
      return askLanguage(event.replyToken);
    }
  }

  // If user previously completed booking, do NOT send summaries again for any random messages
  if (session.completed) { return Promise.resolve(null); }

  // 3) Route steps
  if (type === 'message' && event.message.type === 'text' && !session.started) {
    // Ignore free chat until they type trigger word; but still be helpful about consulting
    return client.replyMessage(event.replyToken, [text("Hi! Type 'book' / 'จอง' / '予約' to start booking.\nYou can also consult our colorists here anytime.")]);
  }

  if (session.step === 'pick_language') {
    if (type === 'postback' && event.postback.data.startsWith('lang=')) {
      const lang = event.postback.data.split('=')[1];
      session.lang = ['en', 'th', 'ja'].includes(lang) ? lang : 'en';
      session.step = 'pick_branch';
      return askBranch(event.replyToken, session.lang);
    } else if (type === 'message' && event.message.type === 'text') {
      const input = event.message.text.toLowerCase();
      if (input.includes('thai') || input.includes('ไทย')) session.lang = 'th';
      else if (input.includes('jap') || input.includes('日本')) session.lang = 'ja';
      else session.lang = 'en';
      session.step = 'pick_branch';
      return askBranch(event.replyToken, session.lang);
    } else {
      return askLanguage(event.replyToken);
    }
  }

  const t = T[session.lang || 'en'];

  if (session.step === 'pick_branch') {
    if (type === 'postback' && event.postback.data.startsWith('branch=')) {
      const val = decodeURIComponent(event.postback.data.split('=')[1]);
      session.data.branch = val;
      session.step = 'pick_date';
      return askDate(event.replyToken, session.lang);
    }
    if (type === 'message' && event.message.type === 'text') {
      const m = event.message.text.toLowerCase();
      if (m.includes('thong')) session.data.branch = BRANCH.THONGLO;
      else if (m.includes('phrom') || m.includes('prom')) session.data.branch = BRANCH.PHROMPHONG;
      if (session.data.branch) {
        session.step = 'pick_date';
        return askDate(event.replyToken, session.lang);
      }
      return askBranch(event.replyToken, session.lang);
    }
  }

  if (session.step === 'pick_date') {
    if (type === 'postback' && event.postback.params?.date) {
      session.data.date = event.postback.params.date; // YYYY-MM-DD
      session.step = 'pick_time';
      return askTime(event.replyToken, session.lang);
    }
    if (type === 'message' && event.message.type === 'text') {
      const m = event.message.text.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(m)) {
        session.data.date = m;
        session.step = 'pick_time';
        return askTime(event.replyToken, session.lang);
      }
      return askDate(event.replyToken, session.lang);
    }
  }

  if (session.step === 'pick_time') {
    if (type === 'postback' && event.postback.params?.time) {
      session.data.time = event.postback.params.time; // HH:MM
      session.step = 'pick_menu';
      return askMenu(event.replyToken, session.lang, session.data.branch);
    }
    if (type === 'message' && event.message.type === 'text') {
      const m = event.message.text.trim();
      if (/^\d{2}:\d{2}$/.test(m)) {
        session.data.time = m;
        session.step = 'pick_menu';
        return askMenu(event.replyToken, session.lang, session.data.branch);
      }
      return askTime(event.replyToken, session.lang);
    }
  }

  if (session.step === 'pick_menu') {
    if (type === 'message' && event.message.type === 'text') {
      session.data.menu = event.message.text.trim();
      session.step = 'ask_name';
      return client.replyMessage(event.replyToken, [text(t.ask_name)]);
    }
  }

  if (session.step === 'ask_name') {
    if (type === 'message' && event.message.type === 'text') {
      session.data.name = event.message.text.trim();
      session.step = 'ask_phone';
      return client.replyMessage(event.replyToken, [text(t.ask_phone)]);
    }
  }

  if (session.step === 'ask_phone') {
    if (type === 'message' && event.message.type === 'text') {
      const raw = event.message.text.replace(/[^0-9+]/g, '');
      if (raw.length < 7) { return client.replyMessage(event.replyToken, [text(t.ask_phone)]); }
      session.data.phone = raw;
      session.step = 'ask_discount';
      return client.replyMessage(event.replyToken, [text(t.ask_discount)]);
    }
  }

  if (session.step === 'ask_discount') {
    if (type === 'message' && event.message.type === 'text') {
      const raw = event.message.text.trim();
      if (/^(no|なし|ไม่มี)$/i.test(raw)) session.data.discount = null; else session.data.discount = raw;
      session.step = 'confirm';
      return showConfirm(event.replyToken, session.lang, session.data);
    }
  }

  if (session.step === 'confirm') {
    if (type === 'postback') {
      if (event.postback.data === 'confirm=yes') {
        session.completed = true;
        DONE_USERS.add(userId);
        const msgs = [
          text(`${t.received_title}\n${t.received_body}`),
          text(summaryText(session.lang, session.data, t.summary_header)),
          registrationFlex(session.lang, session.data.branch),
          text(t.done_hint + "\n" + t.consult_anytime),
        ];
        return client.replyMessage(event.replyToken, msgs);
      } else if (event.postback.data === 'confirm=restart') {
        resetSession(userId);
        const s = getSession(userId);
        s.started = true;
        s.step = 'pick_language';
        return askLanguage(event.replyToken);
      }
    }
  }

  // Default fallback (should rarely happen during flow)
  return client.replyMessage(event.replyToken, [text(t.consult_anytime)]);
}

// ----- Step helpers -----
function askLanguage(replyToken) {
  const t = T.en; // show labels in all languages
  return client.replyMessage(replyToken, [
    text(`${t.start_title}\n${t.consult_anytime}`),
    {
      type: 'flex', altText: 'Choose your language', contents: {
        type: 'bubble', body: {
          type: 'box', layout: 'vertical', spacing: 'md', contents: [
            { type: 'text', text: T.en.pick_language, weight: 'bold', size: 'md' },
            { type: 'text', text: 'ภาษาไทย / English / 日本語', size: 'sm', color: '#888888' },
          ]
        },
        footer: {
          type: 'box', layout: 'vertical', spacing: 'sm', contents: [
            btnPostback('English', 'lang=en'),
            btnPostback('ไทย', 'lang=th'),
            btnPostback('日本語', 'lang=ja'),
          ]
        }
      }
    }
  ]);
}

function askBranch(replyToken, lang='en') {
  const t = T[lang];
  return client.replyMessage(replyToken, [
    {
      type: 'flex', altText: t.pick_branch, contents: {
        type: 'bubble', body: {
          type: 'box', layout: 'vertical', spacing: 'md', contents: [
            { type: 'text', text: t.pick_branch, weight: 'bold' },
          ]
        }, footer: {
          type: 'box', layout: 'vertical', spacing: 'sm', contents: [
            btnPostback(t.thonglo, `branch=${encodeURIComponent(BRANCH.THONGLO)}`),
            btnPostback(t.phromphong, `branch=${encodeURIComponent(BRANCH.PHROMPHONG)}`),
          ]
        }
      }
    }
  ]);
}

function askDate(replyToken, lang='en') {
  const t = T[lang];
  return client.replyMessage(replyToken, [
    {
      type: 'text', text: `${t.pick_date}`,
      quickReply: {
        items: [
          { type: 'action', action: { type: 'datetimepicker', label: 'Pick date', data: 'date=pick', mode: 'date' } }
        ]
      }
    }
  ]);
}

function askTime(replyToken, lang='en') {
  const t = T[lang];
  return client.replyMessage(replyToken, [
    {
      type: 'text', text: `${t.pick_time}`,
      quickReply: {
        items: [
          { type: 'action', action: { type: 'datetimepicker', label: 'Pick time', data: 'time=pick', mode: 'time' } },
          { type: 'action', action: { type: 'message', label: '09:00', text: '09:00' } },
          { type: 'action', action: { type: 'message', label: '13:00', text: '13:00' } },
          { type: 'action', action: { type: 'message', label: '17:00', text: '17:00' } },
        ]
      }
    }
  ]);
}

function askMenu(replyToken, lang='en', branch=BRANCH.THONGLO) {
  const t = T[lang];
  const menuUrl = MENU_URL[branch];
  const label = (branch === BRANCH.THONGLO) ? t.thonglo_menu : t.phromphong_menu;
  return client.replyMessage(replyToken, [
    {
      type: 'flex', altText: t.pick_menu, contents: {
        type: 'bubble', body: {
          type: 'box', layout: 'vertical', spacing: 'md', contents: [
            { type: 'text', text: t.pick_menu, weight: 'bold' },
            { type: 'text', text: t.menu_note, size: 'sm', color: '#888888', wrap: true },
          ]
        }, footer: {
          type: 'box', layout: 'vertical', spacing: 'sm', contents: [
            btnUri(label, menuUrl)
          ]
        }
      }
    }
  ]);
}

function showConfirm(replyToken, lang='en', data) {
  const t = T[lang];
  const summary = summaryText(lang, data, t.summary_header);
  return client.replyMessage(replyToken, [
    {
      type: 'flex', altText: t.confirm_title, contents: {
        type: 'bubble', body: {
          type: 'box', layout: 'vertical', spacing: 'md', contents: [
            { type: 'text', text: t.confirm_title, weight: 'bold' },
            { type: 'text', text: summary, wrap: true },
          ]
        }, footer: {
          type: 'box', layout: 'vertical', spacing: 'sm', contents: [
            btnPostback(t.confirm_button, 'confirm=yes'),
            btnPostback(t.change_button, 'confirm=restart'),
          ]
        }
      }
    }
  ]);
}

function registrationFlex(lang='en', branch=BRANCH.THONGLO) {
  const t = T[lang];
  const url = REG_URL[branch];
  const label = (branch === BRANCH.THONGLO) ? t.register_thonglo : t.register_phromphong;
  return {
    type: 'flex', altText: t.registration_header, contents: {
      type: 'bubble', body: {
        type: 'box', layout: 'vertical', spacing: 'md', contents: [
          { type: 'text', text: t.registration_header, weight: 'bold' },
          { type: 'text', text: t.registration_desc, wrap: true },
        ]
      }, footer: {
        type: 'box', layout: 'vertical', spacing: 'sm', contents: [
          btnUri(label, url)
        ]
      }
    }
  };
}

function summaryText(lang, data, headerLabel) {
  const lines = [
    `${headerLabel}:`,
    `• Branch: ${data.branch || '-'}`,
    `• Date: ${data.date || '-'}`,
    `• Time: ${data.time || '-'}`,
    `• Menu: ${data.menu || '-'}`,
    `• Name: ${data.name || '-'}`,
    `• Phone: ${data.phone || '-'}`,
    `• Discount: ${data.discount || '—'}`,
    ''
  ];
  return lines.join('\n');
}

// ----- UI helpers -----
function text(s) { return { type: 'text', text: s }; }
function btnPostback(label, data) {
  return { type: 'button', style: 'primary', action: { type: 'postback', label, data, displayText: label } };
}
function btnUri(label, uri) {
  return { type: 'button', style: 'link', action: { type: 'uri', label, uri } };
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
