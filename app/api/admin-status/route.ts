import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isAdminFromRequestCookies } from '@/lib/auth';

// Client-side tidak boleh membaca cookie admin (HttpOnly), jadi komponen client
// tanya lewat endpoint ini untuk tahu status admin-nya sendiri.
export async function GET() {
  const isAdmin = isAdminFromRequestCookies(cookies());
  return NextResponse.json({ isAdmin });
}
