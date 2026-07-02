import { dispatchModuleApi } from '@/lib/modules/router'

export const dynamic = 'force-dynamic'
// Module route files can't export their own maxDuration (breaks the generated
// router's structural typing), so this shared dispatcher sets one ceiling for
// every module route - generous enough for slower operations like IMAP polling.
export const maxDuration = 60

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
