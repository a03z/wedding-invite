import { readJsonBody, saveRsvp } from '../lib/guests.js';

const ALCOHOL = ['Вино', 'Водка', 'Безалкогольное'];
const SOFT_DRINKS = ['Сок', 'Кола', 'Спрайт'];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).send('Method not allowed');
  }

  let body;
  try {
    body = readJsonBody(req);
  } catch {
    return res.status(400).json({ error: 'Некорректный запрос' });
  }

  const name = typeof body.name === 'string' ? body.name.replace(/\s+/g, ' ').trim() : '';
  if (!name || name.length > 80) return res.status(400).json({ error: 'Укажите имя (до 80 символов)' });
  if (!ALCOHOL.includes(body.alcohol)) return res.status(400).json({ error: 'Выберите алкогольный напиток' });
  if (!SOFT_DRINKS.includes(body.soft_drink)) return res.status(400).json({ error: 'Выберите безалкогольный напиток' });

  const guestId =
    typeof body.guest_id === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(body.guest_id)
      ? body.guest_id
      : crypto.randomUUID();

  try {
    await saveRsvp({
      id: guestId,
      guest_id: guestId,
      name,
      alcohol: body.alcohol,
      soft_drink: body.soft_drink,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return res.status(500).json({ error: 'Не получилось сохранить ответ. Попробуйте ещё раз.' });
  }

  return res.status(201).json({ ok: true });
}
