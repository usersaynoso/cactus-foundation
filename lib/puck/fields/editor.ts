'use client'

// The editor half of the custom-field split. This is the ONLY module that imports
// the 'use client' field widgets, and only the two admin Puck editors import this,
// so the widgets (and the Puck editor runtime one of them pulls in) stay out of the
// public page graph entirely. See lib/puck/fields/registry.tsx for the why.
//
// Keep this list in step with FIELD_WIDGET_NAMES - registry.test.ts fails if it drifts.

import { registerFieldWidgets } from '@/lib/puck/fields/registry'
import { SiteColourField } from '@/lib/puck/SiteColourField'
import { SiteFontField } from '@/lib/puck/SiteFontField'
import { BorderField } from '@/lib/puck/BorderField'
import {
  SectionBgColorField,
  HeroBgColorField,
  HeaderBgColorField,
  PageBgColorField,
} from '@/lib/puck/BgColorField'
import { LayoutPickerField } from '@/lib/puck/LayoutPickerField'
import {
  ResponsiveTextField,
  ResponsiveSelectField,
  ResponsiveNumberField,
} from '@/lib/puck/ResponsiveValueField'
import { VisibilityField } from '@/lib/puck/VisibilityField'
import { MinMaxPairField } from '@/lib/puck/MinMaxPairField'
import { ClearableNumberField } from '@/lib/puck/ClearableNumberField'

// Called at module scope by the Puck editors. A plain side-effecting import would
// be legal too, but calling an exported function keeps the import a *used* value,
// so no bundler can decide the module is dead and shake it out from under us.
export function registerEditorFields(): void {
  registerFieldWidgets({
    SiteColourField,
    SiteFontField,
    BorderField,
    SectionBgColorField,
    HeroBgColorField,
    HeaderBgColorField,
    PageBgColorField,
    LayoutPickerField,
    ResponsiveTextField,
    ResponsiveSelectField,
    ResponsiveNumberField,
    VisibilityField,
    MinMaxPairField,
    ClearableNumberField,
  })
}
