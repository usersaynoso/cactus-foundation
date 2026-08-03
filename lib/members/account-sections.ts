import { NextResponse } from 'next/server'

// The profile page saves through four separate routes (profile, profile
// visibility, avatar, username). One shared refusal keeps them saying the same
// thing: a member who left the page open before an admin switched the section
// off should get one answer, not four differently-worded failures.
//
// 403 rather than 404: the route exists, the site has simply stopped offering
// it, which is the same shape as the avatarUploadsEnabled refusal next door.
export const PROFILE_SECTION_OFF_MESSAGE = 'The profile page is switched off for this site.'

export function profileSectionOffResponse() {
  return NextResponse.json({ error: PROFILE_SECTION_OFF_MESSAGE }, { status: 403 })
}
