/** Test fixtures for the web world (engine tests only). */

/** The Inkwell data model from docs/WEB_TRACK.md, with a small seed. */
export const INKWELL_TEST_SCHEMA = `
CREATE TABLE series   (id INTEGER PRIMARY KEY, title TEXT NOT NULL, genre TEXT, author TEXT);
CREATE TABLE episodes (id INTEGER PRIMARY KEY, series_id INTEGER NOT NULL, number INTEGER NOT NULL,
                       title TEXT NOT NULL, published INTEGER NOT NULL DEFAULT 1, likes INTEGER NOT NULL DEFAULT 0);
CREATE TABLE comments (id INTEGER PRIMARY KEY, episode_id INTEGER NOT NULL, author TEXT NOT NULL,
                       text TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT '2026-10-01');
CREATE TABLE users    (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL);
CREATE TABLE sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL);
INSERT INTO series (title, genre, author) VALUES
  ('Moonlit Deliveries', 'slice of life', 'Mina'),
  ('Grove & Gear', 'fantasy', 'Mina'),
  ('Night Shift Noodles', 'comedy', 'Theo');
INSERT INTO episodes (series_id, number, title, likes) VALUES
  (1, 1, 'The first night', 12), (1, 2, 'Rain on the roofs', 30),
  (2, 1, 'Sprockets', 7), (3, 1, 'Extra broth', 21);
INSERT INTO comments (episode_id, author, text) VALUES (1, 'reader1', 'Lovely'), (2, 'reader2', 'Wow');
`;
