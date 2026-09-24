import { prisma } from '@/lib/db/prisma'

// The account-level standing preference, kept in step with the shopper's most
// recent answer ("last order wins") rather than set once and forgotten.
//
// `forEmail` is the address the answer was given about. It only lands when that
// is the account's own address: somebody buying a gift for a friend answered on
// behalf of the friend's email, and their own preference must not move because
// of it.
//
// Never throws at its caller. Every caller is in the middle of something the
// shopper actually asked for - completing an order, viewing their order list -
// and none of those may fail because this convenience did.
export async function syncMemberMarketingConsent(memberId: string, consent: boolean, forEmail: string): Promise<void> {
  await prisma.member
    .updateMany({
      where: { id: memberId, email: { equals: forEmail.trim(), mode: 'insensitive' } },
      data: { marketingConsent: consent },
    })
    .catch((error) => {
      console.error('[members] could not sync marketing consent for', memberId, error)
    })
}
