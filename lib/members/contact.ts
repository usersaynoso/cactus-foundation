import { prisma } from '@/lib/db/prisma'

// The member's real-world name and the organisation they buy on behalf of, as
// filled in by something that is not the member sitting on the account page.
//
// It exists because of a gap nobody saw until a shopper walked into it: they
// check out as a guest, typing their name and their company into the checkout,
// then take up the offer of an account on the confirmation page. Registration
// asks for an email address and nothing else - quite deliberately, it is core's
// sign-up form and knows nothing about orders - so the account they end up with
// has neither name nor organisation on it, and the next checkout asks them for
// both all over again. The details were sitting on their order the whole time.
//
// Blanks only, and that is the whole of the rule. Whatever a member has typed
// into their own account page outranks anything worked out from an order:
// somebody who has corrected their name, or moved to a different company, must
// not have last year's order quietly put it back.
//
// Note what this does NOT touch: paperwork. An invoice is a snapshot taken when
// it was raised (see the shop's shp_invoices), so nothing here can reach back
// into a document that has already been sent.
export async function fillBlankMemberContactDetails(
  memberId: string,
  details: { fullName?: string | null; organisation?: string | null },
): Promise<void> {
  // Trimmed and capped to the same 120 the account page and its route enforce,
  // so a caller with a longer field cannot get a value in here that the member
  // could never have typed themselves.
  const fullName = (details.fullName ?? '').trim().slice(0, 120)
  const organisation = (details.organisation ?? '').trim().slice(0, 120)
  if (!fullName && !organisation) return

  const member = await prisma.member
    .findUnique({ where: { id: memberId }, select: { fullName: true, organisation: true } })
    .catch(() => null)
  if (!member) return

  const data: { fullName?: string; organisation?: string } = {}
  if (fullName && !member.fullName?.trim()) data.fullName = fullName
  if (organisation && !member.organisation?.trim()) data.organisation = organisation
  if (Object.keys(data).length === 0) return

  // Never throws at its caller. Every one of them is in the middle of doing
  // something the member actually asked for - taking an order, listing their
  // orders - and none of those may fail because a convenience did.
  await prisma.member.update({ where: { id: memberId }, data }).catch((error) => {
    console.error('[members] could not fill in blank contact details for', memberId, error)
  })
}
