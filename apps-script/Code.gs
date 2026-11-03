/**
 * Бэкенд опросника для GitHub Pages: ответы гостей падают в Google Таблицу.
 *
 * Как подключить (подробно в README, раздел «Ответы гостей»):
 *  1. Создайте пустую Google Таблицу.
 *  2. Расширения → Apps Script, вставьте этот файл вместо Код.gs.
 *  3. Развернуть → Новое развёртывание → тип «Веб-приложение»:
 *     «Выполнять от моего имени», доступ — «Все, у кого есть ссылка».
 *  4. Скопируйте URL (заканчивается на /exec) и вставьте его
 *     в константу RSVP_URL в public/app.js.
 *
 * Повторная отправка с того же browser (тем же guest_id) обновляет
 * существующую строку, а не создаёт дубликат.
 */

'use strict';

const HEADERS = ['created_at', 'name', 'alcohol', 'soft_drink', 'guest_id'];
const ALCOHOL = ['Вино', 'Водка', 'Безалкогольное'];
const SOFT_DRINKS = ['Сок', 'Кола', 'Спрайт'];
const GUEST_ID_RE = /^[A-Za-z0-9-]{8,64}$/;

function doPost(e) {
  try {
    let body = {};
    try { body = JSON.parse(e.postData.contents); } catch {
      return reply({ ok: false, error: 'Некорректный запрос' });
    }

    const name = typeof body.name === 'string' ? body.name.replace(/\s+/g, ' ').trim() : '';
    if (!name || name.length > 80) return reply({ ok: false, error: 'Укажите имя (до 80 символов)' });
    if (ALCOHOL.indexOf(body.alcohol) === -1) return reply({ ok: false, error: 'Выберите алкогольный напиток' });
    if (SOFT_DRINKS.indexOf(body.soft_drink) === -1) return reply({ ok: false, error: 'Выберите безалкогольный напиток' });

    const guestId = typeof body.guest_id === 'string' && GUEST_ID_RE.test(body.guest_id)
      ? body.guest_id
      : Utilities.getUuid().replaceAll('-', '');

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    const values = [new Date().toISOString(), name, body.alcohol, body.soft_drink, guestId];

    const rows = sheet.getDataRange().getValues();
    const width = Math.max(HEADERS.length, values.length);
    if (rows.length === 0) {
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
      sheet.appendRow(values);
    } else {
      let row = 0;
      for (let i = 1; i < rows.length && row === 0; i++) {
        if (String(rows[i][HEADERS.indexOf('guest_id')]) === guestId) row = i + 1;
      }
      if (row === 0) sheet.appendRow(values);
      else sheet.getRange(row, 1, 1, values.length).setValues([values]);
    }

    return reply({ ok: true });
  } catch (error) {
    console.error(error);
    return reply({ ok: false, error: 'Не получилось сохранить ответ. Попробуйте ещё раз.' });
  }
}

function reply(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
