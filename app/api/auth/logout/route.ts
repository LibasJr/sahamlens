import { NextResponse } from 'next/server';
import { DEMO_SESSION_COOKIE } from '@/lib/auth';

export async function POST() {
  const response = NextResponse.json({ success: true });
  
  response.cookies.delete('session');
  response.cookies.delete(DEMO_SESSION_COOKIE);
  
  return response;
}
