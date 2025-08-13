// LINE Booking Bot – Triggered Flow (Node.js)
// Starts ONLY when user types one of: "book" (EN), "จอง" (TH), or "予約" (JP).
// Also: after user confirms, sends a text summary + message that booking is received and will be reconfirmed, then registration link.

const express = require('express');
const line = require('@line/bot-sdk');

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

const client = new line.Client(config);
const app = express();

// Simple in-memory state store. Replace with a DB for production.
const userState = new Map();

// ===== Utilities =====
const MENUS = {
  THONGLOR: 'https://fufuhaircolor.com/thong-lo-%7C-menu',
  PHROMPHONG: 'https://fufuhaircolor.com/phrom-phong-%7C-menu',
};

const REGISTRATION_FORM_URL = process.env.REGISTRATION_FORM_URL || '<<PASTE_YOUR_REGISTRATION_FORM_URL>>';

const TRIGGER_REGEX = /(^|\s)(book|จอง|予約)(\s|$)/i; // words that start the flow

function getUser(ctx) {
  if (!userState.has(ctx)) userState.set(ctx, { lang: null, branch: null });
  return userState.get(ctx);
}

function resetUser(ctx) {
  userState.set(ctx, { lang: null, branch: null, date: null, time: null, service: null, name: null, phone: null, discount: null });
  return userState.get(ctx);
}

function t(lang, key) {
  const copy = {
    START_HINT: {
      EN: "Hi! Type 'book' to start a booking. / พิมพ์ 'จอง' เพื่อเริ่มจอง / '予約' で開始",
      JP: "こんにちは！ 'book' または '予約' と送ると予約が開始します。/ 'จอง' でもOK",
      TH: "สวัสดีค่ะ! พิมพ์คำว่า 'จอง' หรือ 'book' เพื่อเริ่มจองได้เลย / พิมพ์ '予約' ก็ได้",
    },
    GREET: {
      EN: 'Hello! Please select your preferred language.',
      JP: 'こんにちは！ご希望の言語をお選びください。',
      TH: 'สวัสดีค่ะ! กรุณาเลือกภาษาที่ต้องการค่ะ',
    },
    CHOOSE_BRANCH: {
      EN: 'Please choose your preferred branch.',
      JP: 'ご希望のブランチをお選びください。',
      TH: 'กรุณาเลือกสาขาที่ต้องการค่ะ',
    },
    BRANCH_THONGLOR: { EN: 'Thong Lo', JP: 'Thong Lo', TH: 'ทองหล่อ' },
    BRANCH_PHROMPHONG: { EN: 'Phrom Phong', JP: 'Phrom Phong', TH: 'พร้อมพงษ์' },

    ASK_DATE: {
      EN: 'Please select the date that works best for you.',
      JP: 'ご都合の良い日付をお選びください。',
      TH: 'กรุณาเลือกวันที่ที่สะดวกที่สุดค่ะ',
    },
    ASK_TIME: {
      EN: 'Please select the time that works best for you.',
      JP: 'ご都合の良い時間をお選びください。',
      TH: 'กรุณาเลือกเวลาที่สะดวกที่สุดค่ะ',
    },

    ASK_SERVICE: {
      EN: 'Which hair service or treatment would you like to do?',
      JP: 'ご希望のヘアサービスやトリートメントをお知らせください。',
      TH: 'ต้องการทำบริการทำผมหรือทรีตเมนต์แบบไหนคะ?',
    },
    NEED_MENU: {
      EN: 'If you need to see our menu, please tell us your preferred branch.',
      JP: 'メニューをご覧になりたい場合は、ご希望のブランチを教えてください。',
      TH: 'หากต้องการดูเมนู กรุณาแจ้งสาขาที่ต้องการก่อนค่ะ',
    },

    ASK_NAME: {
      EN: 'Please provide your name in English.',
      JP: '英語でお名前をご記入ください。',
      TH: 'กรุณากรอกชื่อเป็นภาษาอังกฤษค่ะ',
    },
    ASK_PHONE: {
      EN: 'Please provide your contact number.',
      JP: 'ご連絡先の電話番号をご記入ください。',
      TH: 'กรุณากรอกหมายเลขโทรศัพท์ที่ติดต่อได้ค่ะ',
    },
    ASK_DISCOUNT: {
      EN: 'Any discount or promotion code to use? (Optional)',
      JP: 'ご利用の割引・プロモーションコードはありますか？（任意）',
      TH: 'มีโค้ดส่วนลดหรือโปรโมชันต้องการใช้ไหมคะ (ไม่บังคับ)',
    },

    CONFIRM_TITLE: {
      EN: 'Please confirm your booking details',
      JP: 'ご予約内容のご確認',
      TH: 'กรุณายืนยันรายละเอียดการจองค่ะ',
    },

    RECEIVED_PENDING: {
      EN: 'We\'ve received your booking request. We will check availability and reconfirm with you shortly.',
      JP: 'ご予約リクエストを受け付けました。空き状況を確認し、追ってご連絡いたします。',
      TH: 'เราได้รับคำขอจองของคุณแล้ว จะตรวจสอบคิวและยืนยันกลับให้โดยเร็วค่ะ',
    },
    SUMMARY_TITLE: {
      EN: 'Booking summary',
      JP: 'ご予約サマリー',
      TH: 'สรุปรายละเอียดการจอง',
    },
  };
  return copy[key][lang || 'EN'];
}

// ===== Message Builders =====
function quickReplyLanguage() {
  return {
    type: 'text',
    text: 'Select language / 言語を選択 / เลือกภาษา',
    quickReply: {
      items: [
        { type: 'action', action: { type: 'postback', label: 'English', data: 'lang=EN' } },
        { type: 'action', action: { type: 'postback', label: '日本語', data: 'lang=JP' } },
        { type: 'action', action: { type: 'postback', label: 'ไทย', data: 'lang=TH' } },
      ],
    },
  };
}

function quickReplyBranch(lang) {
  return {
    type: 'text',
    text: t(lang, 'CHOOSE_BRANCH'),
    quickReply: {
      items: [
        { type: 'action', action: { type: 'postback', label: t(lang, 'BRANCH_THONGLOR'), data: 'branch=THONGLOR' } },
        { type: 'action', action: { type: 'postback', label: t(lang, 'BRANCH_PHROMPHONG'), data: 'branch=PHROMPHONG' } },
      ],
    },
  };
}

function quickReplyDate(lang) {
  return {
    type: 'text',
    text: t(lang, 'ASK_DATE'),
    quickReply: {
      items: [
        { type: 'action', action: { type: 'datetimepicker', label: 'Pick date', data: 'pick=date', mode: 'date' } },
      ],
    },
  };
}

function quickReplyTime(lang) {
  return {
    type: 'text',
    text: t(lang, 'ASK_TIME'),
    quickReply: {
      items: [
        { type: 'action', action: { type: 'postback', label: '10:00', data: 'time=10:00' } },
        { type: 'action', action: { type: 'postback', label: '13:00', data: 'time=13:00' } },
        { type: 'action', action: { type: 'postback', label: '16:00', data: 'time=16:00' } },
        { type: 'action', action: { type: 'postback', label: 'Other', data: 'time=OTHER' } },
      ],
    },
  };
}

function askService(lang) {
  return {
    type: 'text',
    text: `${t(lang, 'ASK_SERVICE')}\n\n${t(lang, 'NEED_MENU')}`,
    quickReply: {
      items: [
        { type: 'action', action: { type: 'message', label: 'Color', text: 'Color' } },
        { type: 'action', action: { type: 'message', label: 'Bleach on Color', text: 'Bleach on Color' } },
        { type: 'action', action: { type: 'message', label: 'Treatment', text: 'Treatment' } },
        { type: 'action', action: { type: 'message', label: 'Menu', text: 'Menu' } },
      ],
    },
  };
}

function askName(lang) { return { type: 'text', text: t(lang, 'ASK_NAME') }; }
function askPhone(lang) { return { type: 'text', text: t(lang, 'ASK_PHONE') }; }
function askDiscount(lang) { return { type: 'text', text: t(lang, 'ASK_DISCOUNT') }; }

function showMenuForBranch(lang, branch) {
  const url = branch === 'THONGLOR' ? MENUS.THONGLOR : MENUS.PHROMPHONG;
  return { type: 'text', text: `Here is the menu for your selected branch:\n${url}` };
}

function buildSummaryText(lang, s) {
  const branchLabel = s.branch === 'THONGLOR' ? 'Thong Lo' : 'Phrom Phong';
  return `${t(lang, 'SUMMARY_TITLE')}\n` +
    `Branch: ${branchLabel}\n` +
    `Date: ${s.date || '-'}\n` +
    `Time: ${s.time || '-'}\n` +
    `Service: ${s.service || '-'}\n` +
    `Name: ${s.name || '-'}\n` +
    `Phone: ${s.phone || '-'}\n` +
    `Discount: ${s.discount || '-'}`;
}

// ===== Handlers =====
app.post('/callback', line.middleware(config), async (req, res) => {
  try {
    const results = await Promise.all(req.body.events.map(handleEvent));
    res.json(results);
  } catch (e) {
    console.error(e);
    res.status(500).end();
  }
});

async function handleEvent(event) {
  const userId = event.source.userId || 'unknown';
  const state = getUser(userId);

  if (event.type === 'follow') {
    // Do NOT auto-start. Instruct user to type trigger words to begin.
    return client.replyMessage(event.replyToken, [{ type: 'text', text: t('EN', 'START_HINT') }]);
  }

  if (event.type === 'postback') {
    const data = parseQuery(event.postback.data);

    if (data.lang) {
      state.lang = data.lang; // EN, JP, TH
      return client.replyMessage(event.replyToken, [
        { type: 'text', text: t(state.lang, 'GREET') },
        quickReplyBranch(state.lang),
      ]);
    }

    if (data.branch) {
      state.branch = data.branch; // THONGLOR / PHROMPHONG
      return client.replyMessage(event.replyToken, [quickReplyDate(state.lang)]);
    }

    if (data.pick === 'date' && event.postback.params?.date) {
      state.date = event.postback.params.date; // YYYY-MM-DD
      return client.replyMessage(event.replyToken, [quickReplyTime(state.lang)]);
    }

    if (data.time) {
      if (data.time === 'OTHER') {
        return client.replyMessage(event.replyToken, [{ type: 'text', text: t(state.lang, 'ASK_TIME') + ' (Please type your preferred time)' }]);
      }
      state.time = data.time;
      return client.replyMessage(event.replyToken, [askService(state.lang)]);
    }

    if (data.confirm) {
      if (data.confirm === 'YES') {
        const msgs = [
          { type: 'text', text: t(state.lang, 'RECEIVED_PENDING') },
          { type: 'text', text: buildSummaryText(state.lang, state) },
          { type: 'text', text: 'Registration form: ' + REGISTRATION_FORM_URL },
        ];
        return client.replyMessage(event.replyToken, msgs);
      }
      if (data.confirm === 'EDIT') {
        return client.replyMessage(event.replyToken, [quickReplyBranch(state.lang)]);
      }
    }

    return Promise.resolve(null);
  }

  if (event.type === 'message' && event.message.type === 'text') {
    const text = (event.message.text || '').trim();

    // 1) Trigger: user types book/จอง/予約 → reset state & start
    if (TRIGGER_REGEX.test(text)) {
      resetUser(userId);
      return client.replyMessage(event.replyToken, [quickReplyLanguage()]);
    }

    // 2) Menu intent (independent; usable during flow)
    if (/\bmenu\b/i.test(text) || /メニュー/.test(text) || /เมนู/.test(text)) {
      if (!state.branch) {
        return client.replyMessage(event.replyToken, [
          { type: 'text', text: t(state.lang || 'EN', 'NEED_MENU') },
          quickReplyBranch(state.lang || 'EN'),
        ]);
      }
      return client.replyMessage(event.replyToken, [showMenuForBranch(state.lang || 'EN', state.branch)]);
    }

    // 3) If language not chosen yet, ignore normal chats until triggered again
    if (!state.lang) {
      // Don’t auto-initiate; gently remind how to start
      return client.replyMessage(event.replyToken, [{ type: 'text', text: t('EN', 'START_HINT') }]);
    }

    // 4) Continue booking flow sequentially
    if (!state.branch) {
      return client.replyMessage(event.replyToken, [quickReplyBranch(state.lang)]);
    }
    if (!state.date) {
      return client.replyMessage(event.replyToken, [quickReplyDate(state.lang)]);
    }
    if (!state.time) {
      if (/^\d{1,2}:\d{2}$/.test(text)) {
        state.time = text;
        return client.replyMessage(event.replyToken, [askService(state.lang)]);
      }
      return client.replyMessage(event.replyToken, [quickReplyTime(state.lang)]);
    }
    if (!state.service) {
      state.service = text; // free text (Color, Treatment, etc.)
      return client.replyMessage(event.replyToken, [askName(state.lang)]);
    }
    if (!state.name) {
      state.name = text;
      return client.replyMessage(event.replyToken, [askPhone(state.lang)]);
    }
    if (!state.phone) {
      state.phone = text;
      return client.replyMessage(event.replyToken, [askDiscount(state.lang)]);
    }
    if (!state.discount) {
      state.discount = text === '-' ? '' : text;
      // Send Flex summary for confirmation with buttons
      return client.replyMessage(event.replyToken, [
        {
          type: 'flex',
          altText: t(state.lang, 'CONFIRM_TITLE'),
          contents: {
            type: 'bubble',
            header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: t(state.lang, 'CONFIRM_TITLE'), weight: 'bold', size: 'md' }] },
            body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [
              { type: 'box', layout: 'baseline', contents: [{ type: 'text', text: 'Branch', flex: 2 }, { type: 'text', text: (state.branch === 'THONGLOR' ? 'Thong Lo' : 'Phrom Phong'), flex: 5 }] },
              { type: 'box', layout: 'baseline', contents: [{ type: 'text', text: 'Date', flex: 2 }, { type: 'text', text: state.date || '-', flex: 5 }] },
              { type: 'box', layout: 'baseline', contents: [{ type: 'text', text: 'Time', flex: 2 }, { type: 'text', text: state.time || '-', flex: 5 }] },
              { type: 'box', layout: 'baseline', contents: [{ type: 'text', text: 'Service', flex: 2 }, { type: 'text', text: state.service || '-', flex: 5 }] },
              { type: 'box', layout: 'baseline', contents: [{ type: 'text', text: 'Name', flex: 2 }, { type: 'text', text: state.name || '-', flex: 5 }] },
              { type: 'box', layout: 'baseline', contents: [{ type: 'text', text: 'Phone', flex: 2 }, { type: 'text', text: state.phone || '-', flex: 5 }] },
              { type: 'box', layout: 'baseline', contents: [{ type: 'text', text: 'Discount', flex: 2 }, { type: 'text', text: state.discount || '-', flex: 5 }] },
            ] },
            footer: { type: 'box', layout: 'horizontal', spacing: 'md', contents: [
              { type: 'button', style: 'primary', action: { type: 'postback', label: '✅ Confirm', data: 'confirm=YES' } },
              { type: 'button', style: 'secondary', action: { type: 'postback', label: '✏️ Edit', data: 'confirm=EDIT' } },
            ] },
          },
        },
      ]);
    }

    // After discount collected, any next message triggers summary again
    return client.replyMessage(event.replyToken, [{ type: 'text', text: buildSummaryText(state.lang, state) }]);
  }

  return Promise.resolve(null);
}

function parseQuery(q) {
  const out = {};
  (q || '').split('&').forEach(pair => {
    const [k, v] = pair.split('=');
    if (k) out[k] = decodeURIComponent(v || '');
  });
  return out;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('LINE bot listening on ' + PORT));
