import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { readJson, writeJson } from '@/lib/dbLocal';
import nodemailer from 'nodemailer';

export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    if (!email) {
      return NextResponse.json({ error: 'Email wajib diisi.' }, { status: 400 });
    }

    const users = readJson('data/users.json') || [];
    const userIndex = users.findIndex((u: any) => u.email?.toLowerCase() === email.trim().toLowerCase());

    if (userIndex === -1) {
      // Don't reveal if user exists or not for security, just return success
      return NextResponse.json({ success: true, message: 'Jika email terdaftar, kode reset akan dikirim ke email Anda.' });
    }

    // Generate 6 digit code
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Update user record
    users[userIndex].reset_code = resetCode;
    users[userIndex].reset_code_expires = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 mins expiry
    
    writeJson('data/users.json', users);

    // Try to send actual email if SMTP is configured
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
          to: users[userIndex].email,
          subject: 'Kode Reset Password SahamLens',
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
              <h2 style="color: #0f172a;">Permintaan Reset Password</h2>
              <p style="color: #475569;">Seseorang baru saja meminta reset password untuk akun SahamLens Anda (<strong>${users[userIndex].email}</strong>).</p>
              <p style="color: #475569;">Berikut adalah kode verifikasi 6 digit Anda:</p>
              <div style="background-color: #f8fafc; border: 1px dashed #cbd5e1; padding: 15px; text-align: center; margin: 20px 0; border-radius: 5px;">
                <h1 style="color: #0d9488; letter-spacing: 10px; margin: 0; font-size: 32px;">${resetCode}</h1>
              </div>
              <p style="color: #64748b; font-size: 12px;">Kode ini hanya berlaku 15 menit. Jika bukan Anda yang meminta, abaikan email ini.</p>
            </div>
          `
        });
        
        console.log(`[AUTH] Email reset berhasil dikirim ke ${users[userIndex].email}`);
      } catch (emailError: any) {
        console.error(`[AUTH] Gagal mengirim email: ${emailError.message}`);
        // Fallback to terminal if email fails
        console.log(`\n========================================`);
        console.log(`[AUTH] Kode Reset Password untuk ${users[userIndex].email}: ${resetCode}`);
        console.log(`========================================\n`);
      }
    } else {
      // Print to terminal if no SMTP config (Development mode)
      console.log(`\n========================================`);
      console.log(`[AUTH] Kode Reset Password untuk ${users[userIndex].email}: ${resetCode}`);
      console.log(`========================================\n`);
    }

    return NextResponse.json({ success: true, message: 'Instruksi reset password telah dikirim.' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
