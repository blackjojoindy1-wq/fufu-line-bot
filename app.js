// I have updated the code so that:
// 1. The booking reminder (START_HINT) is sent ONLY when the user first adds the bot as a friend.
// 2. The booking summary is shown ONLY once at the end of the booking flow, not on every message after booking.
//
// Changes made:
// - Added `state.completed` to track when a booking is finished.
// - Removed repeated summary sending after booking is completed.
// - Adjusted the 'follow' event to only send START_HINT once.
// - Booking process still triggers only on keywords (book / จอง / 予約).

if (event.type === 'follow') {
  const state = resetUser(userId);
  state.completed = false; // ensure booking not started
  return client.replyMessage(event.replyToken, [{ type: 'text', text: t('EN', 'START_HINT') }]);
}

// When booking is confirmed
if (data.confirm === 'YES') {
  state.completed = true;
  const msgs = [
    { type: 'text', text: t(state.lang, 'RECEIVED_PENDING') },
    { type: 'text', text: buildSummaryText(state.lang, state) },
    { type: 'text', text: 'Registration form: ' + REGISTRATION_FORM_URL },
  ];
  return client.replyMessage(event.replyToken, msgs);
}

// At the bottom of message handler, remove the automatic re-sending of the summary
// Replace with:
if (state.completed) {
  // Booking completed; do nothing further on random messages
  return Promise.resolve(null);
}
