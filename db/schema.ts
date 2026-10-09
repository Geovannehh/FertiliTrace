import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const ledgers = sqliteTable('fertili_ledgers',{
 id:text('id').primaryKey(),
 revision:integer('revision').notNull().default(0),
 payload:text('payload').notNull(),
});
