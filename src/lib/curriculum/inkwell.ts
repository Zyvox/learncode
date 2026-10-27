/**
 * The Inkwell webtoon studio: the shared data model and seed rows for every "Behind the app"
 * lesson. Lessons import `INKWELL_SCHEMA` (tables + rows) or compose a smaller one from the
 * pieces below. Keep seeds small: result tables have to fit on a phone screen.
 */
import type { SimRequest, WebWorldSpec } from '#lib/curriculum/types.ts';

export const CREATE_TABLES = `
CREATE TABLE series (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  genre TEXT,
  author TEXT
);
CREATE TABLE episodes (
  id INTEGER PRIMARY KEY,
  series_id INTEGER NOT NULL,
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  published INTEGER NOT NULL DEFAULT 1,
  likes INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE comments (
  id INTEGER PRIMARY KEY,
  episode_id INTEGER NOT NULL,
  author TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT '2026-10-01'
);
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL
);
CREATE TABLE sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL
);
`;

export const SEED_SERIES = `
INSERT INTO series (id, title, genre, author) VALUES
  (1, 'Moonlit Deliveries', 'slice of life', 'Mina'),
  (2, 'Grove & Gear', 'fantasy', 'Jun'),
  (3, 'Night Shift Noodles', 'comedy', 'Mina');
`;

export const SEED_EPISODES = `
INSERT INTO episodes (id, series_id, number, title, published, likes) VALUES
  (1, 1, 1, 'The first parcel', 1, 120),
  (2, 1, 2, 'Rain on Pine Street', 1, 98),
  (3, 1, 3, 'The locked gate', 1, 143),
  (4, 1, 4, 'Sketches', 0, 0),
  (5, 2, 1, 'A seed in the gears', 1, 61),
  (6, 2, 2, 'The clockwork fox', 1, 77),
  (7, 3, 1, 'Opening night', 1, 210),
  (8, 3, 2, 'Extra spicy', 1, 188);
`;

export const SEED_COMMENTS = `
INSERT INTO comments (id, episode_id, author, text, created_at) VALUES
  (1, 1, 'ravi', 'That last panel. Wow.', '2026-10-02'),
  (2, 1, 'june_b', 'The cat is the real main character', '2026-10-02'),
  (3, 3, 'ravi', 'Called it. The gate was never locked.', '2026-10-05'),
  (4, 7, 'noodlefan', 'I can smell this episode', '2026-10-06'),
  (5, 7, 'june_b', 'Extra spicy next, please', '2026-10-06');
`;

/** Password hashes are fake on purpose: the lessons explain that real ones look like this. */
export const SEED_USERS = `
INSERT INTO users (id, name, password_hash) VALUES
  (1, 'mina', '$argon2id$v=19$m=65536,t=3,p=4$Zm9vYmFy$4x1Q...'),
  (2, 'ravi', '$argon2id$v=19$m=65536,t=3,p=4$YmF6cXV4$9kLm...');
INSERT INTO sessions (token, user_id) VALUES
  ('tok_mina_123', 1);
`;

/* ------------------------------------------------------------------------------------------ */
/* Story stages: the seeds move with the story (see docs/INFRA.md, "Inkwell remembers").       */
/* ------------------------------------------------------------------------------------------ */

/** After the module 7 boss: episode 4 is published as "The night market", with the learner's comment. */
export const STAGE_PUBLISHED = `
UPDATE episodes SET published = 1, title = 'The night market' WHERE id = 4;
INSERT INTO comments (id, episode_id, author, text, created_at) VALUES
  (6, 4, 'mina', 'Finally out. Thank you for waiting.', '2026-10-08');
`;

/** After module 9: readers have been commenting and liking through the learner's endpoints. */
export const STAGE_LIVE = `
INSERT INTO comments (id, episode_id, author, text, created_at) VALUES
  (7, 4, 'ravi', 'Worth the wait. The lantern panel.', '2026-10-09'),
  (8, 8, 'june_b', 'Extra spicy, as promised.', '2026-10-09');
UPDATE episodes SET likes = likes + 1 WHERE id IN (4, 8);
INSERT INTO sessions (token, user_id) VALUES ('tok_ravi_456', 2);
`;

export type InkwellStage = 'start' | 'published' | 'live';

/**
 * The reading-side schema at a point in the story. Modules 1–7 use 'start', 8–9 'published',
 * 10+ 'live'. Every stage includes the stages before it.
 */
export function INKWELL_AT(stage: InkwellStage, withUsers = false): string {
	const parts = [CREATE_TABLES, SEED_SERIES, SEED_EPISODES, SEED_COMMENTS];
	if (withUsers || stage === 'live') parts.push(SEED_USERS);
	if (stage === 'published' || stage === 'live') parts.push(STAGE_PUBLISHED);
	if (stage === 'live') parts.push(STAGE_LIVE);
	return parts.join('\n');
}

/** Everything: tables and all seed rows. */
export const INKWELL_SCHEMA = [
	CREATE_TABLES,
	SEED_SERIES,
	SEED_EPISODES,
	SEED_COMMENTS,
	SEED_USERS
].join('\n');

/** Tables and the reading-side seeds only (no users/sessions). Good for modules 1–10. */
export const INKWELL_READING = [CREATE_TABLES, SEED_SERIES, SEED_EPISODES, SEED_COMMENTS].join(
	'\n'
);

/**
 * A ready-made Inkwell server with the endpoints the reader app needs. Client-role lessons
 * use it as `serverCode`, so the phone has something to talk to before the learner writes a
 * server of their own. Keep it in sync with what the modules teach.
 */
export const INKWELL_SERVER = `
app.get('/series', (req, res) => {
  res.json(db.all('SELECT id, title, genre, author FROM series ORDER BY id'));
});
app.get('/series/:id', (req, res) => {
  const row = db.get('SELECT * FROM series WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'No series with id ' + req.params.id });
  res.json(row);
});
app.get('/series/:id/episodes', (req, res) => {
  res.json(db.all('SELECT id, number, title, likes FROM episodes WHERE series_id = ? AND published = 1 ORDER BY number', [req.params.id]));
});
app.get('/episodes', (req, res) => {
  const page = Number(req.query.page || 1);
  res.json(db.all('SELECT id, series_id, number, title, likes FROM episodes WHERE published = 1 ORDER BY id LIMIT 5 OFFSET ?', [(page - 1) * 5]));
});
app.get('/episodes/:id', (req, res) => {
  const row = db.get('SELECT * FROM episodes WHERE id = ? AND published = 1', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'No episode with id ' + req.params.id });
  res.json(row);
});
app.get('/episodes/:id/comments', (req, res) => {
  res.json(db.all('SELECT id, author, text, created_at FROM comments WHERE episode_id = ? ORDER BY id', [req.params.id]));
});
app.post('/episodes/:id/comments', (req, res) => {
  const body = req.body || {};
  if (!body.author || !body.text) return res.status(400).json({ error: 'author and text are required' });
  const r = db.run('INSERT INTO comments (episode_id, author, text) VALUES (?, ?, ?)', [req.params.id, body.author, body.text]);
  res.status(201).json({ id: r.lastId, author: body.author, text: body.text });
});
app.put('/episodes/:id/like', (req, res) => {
  const r = db.run('UPDATE episodes SET likes = likes + 1 WHERE id = ?', [req.params.id]);
  if (r.changes === 0) return res.status(404).json({ error: 'No episode with id ' + req.params.id });
  res.json(db.get('SELECT id, likes FROM episodes WHERE id = ?', [req.params.id]));
});
`;

/** Shorthand for a client-role world talking to the ready-made Inkwell server. */
export function clientWorld(extra: Partial<WebWorldSpec> = {}): WebWorldSpec {
	return {
		kind: 'web',
		role: 'client',
		schema: INKWELL_READING,
		serverCode: INKWELL_SERVER,
		...extra
	};
}

/** Shorthand for a server-role world over the reading data. */
export function serverWorld(
	requests: SimRequest[],
	extra: Partial<WebWorldSpec> = {}
): WebWorldSpec {
	return { kind: 'web', role: 'server', schema: INKWELL_READING, requests, ...extra };
}

/** Shorthand for a sql-role world over the reading data. */
export function sqlWorld(extra: Partial<WebWorldSpec> = {}): WebWorldSpec {
	return { kind: 'web', role: 'sql', schema: INKWELL_READING, ...extra };
}
