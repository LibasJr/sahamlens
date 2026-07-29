import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { readJson, writeJson } from '@/lib/dbLocal';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return NextResponse.json({ error: 'Email dan password wajib diisi' }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'Password minimal 6 karakter' }, { status: 400 });
    }

    const users = readJson('data/users.json') || [];
    const existingIndex = users.findIndex((u: any) => u.email?.toLowerCase() === email.trim().toLowerCase());

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const hashed = bcrypt.hashSync(password, 10);

    if (existingIndex !== -1) {
      const user = users[existingIndex];
      if (user.is_verified) {
        return NextResponse.json({ error: 'Email sudah terdaftar dan terverifikasi' }, { status: 409 });
      }
      // Update existing unverified user
      user.password_hash = hashed;
      user.verification_code = code;
    } else {
      const newUser = {
        id: Date.now().toString(), // String so it doesn't break if someone expects number but we use string
        email: email.trim(),
        password_hash: hashed,
        role: 'free',
        is_verified: false,
        is_pro: false,
        created_at: new Date().toISOString(),
        trial_ends_at: null,
        demo_ends_at: null,
        verification_code: code
      };
      users.push(newUser);
    }

    writeJson('data/users.json', users);

    if (process.env.SMTP_EMAIL && process.env.SMTP_PASSWORD) {
      try {
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: process.env.SMTP_EMAIL,
            pass: process.env.SMTP_PASSWORD
          }
        });

        await transporter.sendMail({
          from: `"SahamLens Admin" <${process.env.SMTP_EMAIL}>`,
          to: email.trim(),
          subject: 'Kode Verifikasi SahamLens',
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
              <h2 style="color: #0f172a;">Selamat datang di SahamLens!</h2>
              <p style="color: #475569;">Untuk menyelesaikan pendaftaran akun Anda, gunakan kode verifikasi berikut:</p>
              <div style="background-color: #f8fafc; border: 1px dashed #cbd5e1; padding: 15px; text-align: center; margin: 20px 0; border-radius: 5px;">
                <h1 style="color: #0d9488; letter-spacing: 10px; margin: 0; font-size: 32px;">${code}</h1>
              </div>
              <p style="color: #64748b; font-size: 12px;">Jika Anda tidak mendaftar di SahamLens, abaikan email ini.</p>
            </div>
          `
        });
        
        console.log(`[AUTH] Email verifikasi berhasil dikirim ke ${email}`);
      } catch (emailError: any) {
        console.error(`[AUTH] Gagal mengirim email verifikasi: ${emailError.message}`);
        console.log(`\n========================================`);
        console.log(`[AUTH] Kode Verifikasi untuk ${email}: ${code}`);
        console.log(`========================================\n`);
      }
    } else {
      console.log(`\n========================================`);
      console.log(`[AUTH] Kode Verifikasi untuk ${email}: ${code}`);
      console.log(`========================================\n`);
    }

    return NextResponse.json({ success: true, message: 'Kode verifikasi telah dikirim ke email Anda.' });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
