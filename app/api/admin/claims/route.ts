import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin, getScopedPersonIds } from '@/lib/auth';
import crypto from 'crypto';

// GET: semua item yang butuh perhatian admin --
//   klaim_request pending + register_inquiry open
export async function GET() {
  let session;
  try { session = await requireAdmin(); } catch (e) { return e as Response; }

  const scopedIds = await getScopedPersonIds(session.sub);

  const [claims, inquiries] = await Promise.all([
    prisma.klaimRequest.findMany({
      where: {
        status: 'pending',
        ...(scopedIds !== null ? { personId: { in: scopedIds } } : {}),
      },
      orderBy: { requestedAt: 'asc' },
      include: {
        person: { select: { nama: true, gender: true } },
      },
    }),
    // register_inquiry (nama tidak ketemu di tree) TIDAK punya personId --
    // secara alami tidak bisa diatribusikan ke cabang manapun. Sengaja
    // cuma ditampilkan ke super admin (scopedIds === null), disembunyikan
    // dari sub-admin -- daripada nebak "ini punya cabang siapa" secara
    // salah, atau bocorin seluruh permintaan pencarian lintas cabang ke
    // sub-admin yang seharusnya cuma urus satu cabang.
    scopedIds === null
      ? prisma.registerInquiry.findMany({
          where: { status: 'open' },
          orderBy: { createdAt: 'asc' },
        })
      : Promise.resolve([]),
  ]);

  return NextResponse.json({ claims, inquiries });
}