import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { db } from "../db";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";
const JWT_EXPIRES_IN = "30d";

type UserRow = {
  id: string;
  email: string;
  passwordHash: string;
  name: string | null;
  createdAt: string;
};

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
};

export async function signup(
  email: string,
  password: string,
  name?: string
): Promise<{ token: string; user: AuthUser }> {
  const existing = db
    .query<{ id: string }, string>("SELECT id FROM users WHERE email = ?")
    .get(email.toLowerCase());

  if (existing) {
    throw new Error("Email already in use");
  }

  const passwordHash = await Bun.password.hash(password);
  const id = uuidv4();

  db.run(
    "INSERT INTO users (id, email, passwordHash, name, createdAt) VALUES (?, ?, ?, ?, ?)",
    [id, email.toLowerCase(), passwordHash, name || null, new Date().toISOString()]
  );

  const token = jwt.sign({ userId: id, email }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });

  return { token, user: { id, email: email.toLowerCase(), name: name || null } };
}

export async function login(
  email: string,
  password: string
): Promise<{ token: string; user: AuthUser }> {
  const user = db
    .query<UserRow, string>("SELECT * FROM users WHERE email = ?")
    .get(email.toLowerCase());

  if (!user) {
    throw new Error("Invalid email or password");
  }

  const valid = await Bun.password.verify(password, user.passwordHash);
  if (!valid) {
    throw new Error("Invalid email or password");
  }

  const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });

  return {
    token,
    user: { id: user.id, email: user.email, name: user.name },
  };
}

export function verifyToken(token: string): { userId: string; email: string } {
  return jwt.verify(token, JWT_SECRET) as { userId: string; email: string };
}

export function getUserById(userId: string): AuthUser | null {
  const row = db
    .query<UserRow, string>(
      "SELECT id, email, name, createdAt FROM users WHERE id = ?"
    )
    .get(userId);
  if (!row) return null;
  return { id: row.id, email: row.email, name: row.name };
}
