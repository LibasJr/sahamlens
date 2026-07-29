import fs from 'fs';
import path from 'path';

export interface User {
  id: string;
  email: string;
  password_hash: string;
  role: 'admin' | 'user';
  is_verified: boolean;
  is_pro: boolean;
  created_at: string;
  trial_ends_at: string | null;
  demo_ends_at: string | null;
  verification_code: string | null;
}

const dataPath = path.join(process.cwd(), 'data', 'users.json');

export function getUsers(): User[] {
  try {
    const data = fs.readFileSync(dataPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
}

export function saveUsers(users: User[]) {
  fs.writeFileSync(dataPath, JSON.stringify(users, null, 2), 'utf8');
}

export function getUserByEmail(email: string): User | undefined {
  const users = getUsers();
  return users.find((u) => u.email === email);
}

export function getUserById(id: string): User | undefined {
  const users = getUsers();
  return users.find((u) => u.id === id);
}

export function updateUser(id: string, updates: Partial<User>) {
  const users = getUsers();
  const idx = users.findIndex((u) => u.id === id);
  if (idx !== -1) {
    users[idx] = { ...users[idx], ...updates };
    saveUsers(users);
  }
}

export function createUser(user: User) {
  const users = getUsers();
  users.push(user);
  saveUsers(users);
}
