'use strict';

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
    const response = await fetch('/api/rsvp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, guest_id: getGuestId() }),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.error || 'Не получилось отправить, попробуйте ещё раз');
    }

    thanksName.textContent = data.name.trim();
    form.hidden = true;
    thanks.hidden = false;
    thanks.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (error) {
    status.textContent = error.message;
    button.disabled = false;
  }
});
