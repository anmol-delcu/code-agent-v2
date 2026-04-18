import { Database } from "bun:sqlite";
import fs from "fs";

fs.mkdirSync("./data", { recursive: true });

export const db = new Database("./data/app.db", { create: true });

db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    passwordHash TEXT NOT NULL,
    name TEXT,
    createdAt TEXT NOT NULL
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    containerId TEXT,
    name TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    FOREIGN KEY (userId) REFERENCES users(id)
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    containerId TEXT NOT NULL,
    messages TEXT NOT NULL DEFAULT '[]',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )
`);

db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_lookup ON sessions (userId, containerId)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_projects_user ON projects (userId)`);
