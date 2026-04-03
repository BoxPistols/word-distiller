import { NextRequest, NextResponse } from 'next/server'

const ENABLE_BASIC_AUTH = process.env.BASIC_USER && process.env.BASIC_PASS

export function middleware(req: NextRequest) {
  if (!ENABLE_BASIC_AUTH) return NextResponse.next()

  const auth = req.headers.get('authorization') ?? ''
  const expected = 'Basic ' + Buffer.from(
    `${process.env.BASIC_USER}:${process.env.BASIC_PASS}`
  ).toString('base64')

  if (auth !== expected) {
    return new NextResponse('Unauthorized', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="distiller"' },
    })
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|_next/webpack-hmr|favicon.ico).*)'],
}
