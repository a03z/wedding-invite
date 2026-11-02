import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const ALCOHOL = ['Вино', 'Водка', 'Безалкогольное'];
const SOFT_DRINKS = ['Сок', 'Кола', 'Спрайт'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  try {
    const body = await req.json();
    const name = typeof body.name === 'string' ? body.name.replace(/\s+/g, ' ').trim() : '';
    if (!name || name.length > 80) return res.status(400).json({ error: 'Укажите имя (до 80 символов)' });
    if (!ALCOHOL.includes(body.alcohol)) return res.status(400).json({ error: 'Выберите алкогольный напиток' });
    if (!SOFT_DRINKS.includes(body.soft_drink)) return res.status(400).json({ error: 'Выберите безалкогольный напиток' });

    const guestId =
      typeof body.guest_id === 'string' && body.guest_id.length <= 64
        ? body.guest_id
        : crypto.randomUUID();
    const record = {
      id: guestId,
      guest_id: guestId,
      name,
      alcohol: body.alcohol,
      soft_drink: body.soft_drink,
      created_at: new Date().toISOString(),
    };
    await redis.set(`rsvp:${guestId}:${name}`, JSON.stringify(record));

    return res.status(201).json({ ok: true });
  } catch {
    return res.status(500).json({ error: 'Некорректный запрос' });
  }
}
