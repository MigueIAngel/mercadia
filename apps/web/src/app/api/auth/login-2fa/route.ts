import type { NextRequest } from 'next/server';
import { postGateway, sessionResponse } from '@/lib/bff';

export async function POST(request: NextRequest) {
  return sessionResponse(await postGateway(request, '/auth/login/2fa', await request.json()));
}
