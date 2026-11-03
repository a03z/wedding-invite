'use strict';

// URL веб-приложения Apps Script — как получить, см. README (раздел «Ответы гостей»)
const RSVP_URL = 'https://script.google.com/macros/s/AKfycbxuEQpFqlevZzJvpM1xdSSA5wjhjd4VfFJcO9TwPGVfmuPLZFBqFGQomREWJARMh8k/exec';

const form = document.querySelector('#rsvp-form');
const status = form.querySelector('.form-status');
const button = form.querySelector('button[type="submit"]');
const thanks = document.querySelector('#thanks');
const thanksName = document.querySelector('#thanks-name');

function getGuestId() {
  const key = 'wedding-rsvp-guest';
  try {
    let id = localStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return null;
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const data = Object.fromEntries(new FormData(form).entries());
  button.disabled = true;
  status.textContent = 'Отправляем…';

  try {
    if (!RSVP_URL.startsWith('https://script.google.com/')) {
      throw new Error('Опросник ещё не подключён: вставьте URL Apps Script в public/app.js');
    }
    // Apps Script не отдаёт CORS-заголовки, поэтому ответ непрозрачный:
    // resolve = доставлено, валидность формы гарантирует браузер
    await fetch(RSVP_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...data, guest_id: getGuestId() }),
    });

    thanksName.textContent = data.name.trim();
    form.hidden = true;
    thanks.hidden = false;
    thanks.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (error) {
    status.textContent = error.message;
    button.disabled = false;
  }
});
