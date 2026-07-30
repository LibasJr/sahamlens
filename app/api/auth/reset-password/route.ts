import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { getUserByEmail, updateUser } from '@/lib/dbUsers';
import bcrypt from 'bcryptjs';

export async function POST(req: Request) {
  try {
    const { email, code, newPassword } = await req.json();

    if (!email || !code || !newPassword) {
      return NextResponse.json({ error: 'Email, kode reset, dan password baru wajib diisi.' }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: 'Password minimal 6 karakter.' }, { status: 400 });
    }

    const user = await getUserByEmail(email);

    if (!user) {
      return NextResponse.json({ error: 'Kode reset salah atau kedaluwarsa.' }, { status: 400 });
    }

    if (!user.reset_code || user.reset_code !== code) {
      return NextResponse.json({ error: 'Kode reset salah atau kedaluwarsa.' }, { status: 400 });
    }

    if (user.reset_code_expires && new Date(user.reset_code_expires).getTime() < Date.now()) {
      return NextResponse.json({ error: 'Kode reset sudah kedaluwarsa. Silakan request ulang.' }, { status: 400 });
    }

    // Encrypt new password
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(newPassword, salt);

    await updateUser(user.id, { password_hash: hash, reset_code: null, reset_code_expires: null });

    return NextResponse.json({ success: true, message: 'Password berhasil diubah. Silakan login.' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
