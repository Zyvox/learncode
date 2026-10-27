/**
 * Database schema (drizzle + SQLite). After changing it run `npx drizzle-kit generate`
 * to add a migration in `drizzle/`; migrations are applied automatically at startup.
 *
 * All timestamps are ISO-8601 strings (`new Date().toISOString()`), which sort correctly as text.
 */
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	/** Always stored trimmed + lowercased. */
	email: text('email').notNull().unique(),
	displayName: text('display_name').notNull(),
	passwordHash: text('password_hash').notNull(),
	themeId: text('theme_id').notNull().default('games'),
	xp: integer('xp').notNull().default(0),
	streak: integer('streak').notNull().default(0),
	/** `YYYY-MM-DD` (UTC) of the last day with at least one completion, or null. */
	lastActiveDay: text('last_active_day'),
	createdAt: text('created_at').notNull()
});

export const sessions = sqliteTable(
	'sessions',
	{
		/** sha256(token) as hex. The raw token only ever lives in the user's cookie. */
		id: text('id').primaryKey(),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		expiresAt: text('expires_at').notNull()
	},
	(t) => [index('sessions_user_id_idx').on(t.userId)]
);

export const progress = sqliteTable(
	'progress',
	{
		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		lessonId: text('lesson_id').notNull(),
		status: text('status', { enum: ['started', 'done'] }).notNull(),
		attempts: integer('attempts').notNull().default(0),
		hintsUsed: integer('hints_used').notNull().default(0),
		lastCode: text('last_code'),
		completedAt: text('completed_at'),
		xpEarned: integer('xp_earned').notNull().default(0),
		updatedAt: text('updated_at').notNull()
	},
	(t) => [primaryKey({ columns: [t.userId, t.lessonId] })]
);

export const badges = sqliteTable(
	'badges',
	{
		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		badgeId: text('badge_id').notNull(),
		earnedAt: text('earned_at').notNull()
	},
	(t) => [primaryKey({ columns: [t.userId, t.badgeId] })]
);

export type UserRow = typeof users.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type ProgressRow = typeof progress.$inferSelect;
export type BadgeRow = typeof badges.$inferSelect;
