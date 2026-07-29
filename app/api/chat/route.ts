import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { model } from '@/lib/gemini';

export async function POST(request: Request) {
  try {
    const { prompt, context } = await request.json();

    if (!model) {
      return NextResponse.json({
        role: 'assistant',
        content: 'Maaf, API Key Gemini belum dikonfigurasi atau model tidak valid.'
      });
    }

    const systemInstruction = `Kamu adalah Analis Senior SahamLens — platform analisis saham Indonesia.

## Aturan Menjawab:
1. Jawab dalam bahasa Indonesia yang profesional tapi mudah dipahami.
2. Gunakan format Markdown yang rapi: heading, bold, bullet, dan emoji jika perlu.
3. Panjang jawaban 3-5 paragraf substantif, BUKAN jawaban 1 kalimat kosong.
4. Jika ada data analisis teknikal/fundamental di bawah, gunakan sebagai referensi untuk memperkuat jawabanmu. Sebutkan indikator, sinyal, dan nilainya secara alami seolah kamu sendiri yang menganalisis. JANGAN PERNAH menyebut "10 Agent Council", "agent", "council", atau "data dari sistem internal". Cukup sampaikan analisisnya langsung.
5. Berikan kesimpulan akhir: **BELI**, **JUAL**, atau **TAHAN** beserta level entry/exit jika memungkinkan.
6. Perkenalkan dirimu cukup sebagai "Analis SahamLens", jangan sebut sumber data internal.

## Data Referensi:
${context}

Jika pengguna bertanya hal umum tentang saham, kaitkan dengan saham di konteks.
`;
    
    // Panggil Gemini API
    const result = await model.generateContent(systemInstruction + "\nPertanyaan User: " + prompt);
    const responseText = result.response.text();

    return NextResponse.json({
      role: 'assistant',
      content: responseText
    });
  } catch (error: any) {
    console.error("Chat API Error:", error);
    return NextResponse.json({ 
      role: 'assistant',
      content: 'Maaf, terjadi kesalahan saat menghubungi AI: ' + error.message 
    }, { status: 500 });
  }
}
