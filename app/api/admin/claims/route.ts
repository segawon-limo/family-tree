import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import crypto from 'crypto';

// GET: semua item yang butuh perhatian admin --
//   klaim_request pending + register_inquiry open
export async function GET() {
  try { await requireAdmin(); } catch (e) { return e as Response; }

  const [claims, inquiries] = await Promise.all([
    prisma.klaimRequest.findMany({
      where: { status: 'pending' },
      orderBy: { requestedAt: 'asc' },
      include: {
        person: { select: { nama: true, gender: true } },
      },
    }),
    prisma.registerInquiry.findMany({
      where: { status: 'open' },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  return NextResponse.json({ claims, inquiries });
}