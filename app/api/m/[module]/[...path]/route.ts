import { dispatchModuleApi } from '@/lib/modules/router'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ module: string; path: string[] }> }

export async function GET(req: Request, ctx: Ctx) {
  return dispatchModuleApi('GET', req, ctx)
}

export async function POST(req: Request, ctx: Ctx) {
  return dispatchModuleApi('POST', req, ctx)
}

export async function PATCH(req: Request, ctx: Ctx) {
  return dispatchModuleApi('PATCH', req, ctx)
}

export async function DELETE(req: Request, ctx: Ctx) {
  return dispatchModuleApi('DELETE', req, ctx)
}
