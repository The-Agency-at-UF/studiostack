# Brand Guidelines

StudioStack should feel connected to The Agency at UF while remaining practical for frequent operational use. This reference distills the official **Agency Brand Book - Nerve** into implementation guidance for the application.

The original 23-page brand-book PDF is approximately 341 MB, which exceeds GitHub's per-file upload limit. It is therefore maintained outside this repository. This document records the rules needed for product design and code review.

## Brand character

The Agency describes the Nerve direction as professional but personality-led, experimental while grounded in history, bold, energetic, collaborative, and willing to challenge familiar agency conventions.

Product copy should be:

- Direct and easy to scan
- Professional without sounding institutional or stiff
- Positive and confident without becoming arrogant
- Specific rather than padded with synonyms or marketing filler

Operational warnings, errors, and destructive actions should prioritize clarity over playful language.

## Official palette

| Color | Hex | RGB | Product use |
| --- | --- | --- | --- |
| Black | `#000000` | `0, 0, 0` | Predominant dark background, high-contrast surfaces, and text on light surfaces |
| White | `#FFFFFF` | `255, 255, 255` | Predominant text on dark surfaces and clean light surfaces |
| Yellow | `#FFB23E` | `255, 178, 62` | Warm accent used sparingly |
| Red | `#FF4D56` | `255, 77, 86` | Energetic accent; reserve product red for errors and destructive actions |
| Dark purple | `#5302D8` | `83, 2, 216` | Primary expressive brand color |
| Light purple | `#AB9BFF` | `171, 155, 255` | Supporting purple and lighter accent |

The brand-book color slide accidentally prints `#000000` beneath the white swatch. Its RGB and CMYK values identify the intended color as `#FFFFFF`.

The dark-purple RGB label also lists 84 for red, while the printed hex `#5302D8` resolves to RGB `83, 2, 216`. StudioStack uses the printed hex as the source of truth.

## Color usage

- Black is the predominant background color in Nerve brand applications.
- White is the predominant text color on dark surfaces.
- Expressive forms combine dark purple, light purple, red, and yellow.
- Dark and light purple should carry more visual weight than red or yellow.
- Yellow and light purple work best as accents.
- Red must retain a clear error or destructive meaning inside the product interface.
- Maintain WCAG-readable contrast for text, controls, focus indicators, and status messages.

## Typography

| Role | Preferred | Available alternative |
| --- | --- | --- |
| Body | Gentona Book | Franklin Gothic Regular |
| Heading | Gentona Bold | Franklin Gothic Bold |

If the licensed Gentona files are unavailable, use a documented web-safe substitute consistently rather than downloading or committing an unlicensed font. Preserve the brand's strong hierarchy through weight, scale, and spacing.

## Logo use

- Use the external Agency wordmark with the University of Florida lockup for public-facing communication.
- Use the shortened internal wordmark only for internal Agency material.
- Keep Agency logos black or white.
- Do not recolor, distort, rotate, add shadows, add gradients, or apply effects to the logo.
- Preserve the logo's proportions and surrounding clear space.
- The lettermark is a secondary mark for cases where the full wordmark is not effective.

## StudioStack implementation note

StudioStack uses the official Nerve purples for interface accents, with its existing neutral operational surfaces:

| Current token | Value |
| --- | --- |
| Ink | `#101010` |
| Paper | `#F3EFE6` |
| Paper light | `#FAF8F2` |
| Primary accent (`--accent`) | `#5302D8` |
| Light accent (`--accent-light`) | `#AB9BFF` |
| Hover accent (`--accent-hover`) | `#4202AD` (derived darker purple) |
| Soft accent (`--accent-soft`) | `#EDE6FB` (derived pale purple) |

The shared tokens in `src/App.css` cover navigation, buttons, links, focus states, calendars, charts, forms, dialogs, and organization previews. Light purple supports dark surfaces and subtle highlights; primary purple supports white-text controls. Error and destructive-action colors remain distinct. The neutral surfaces and derived purple shades are product choices, not additional official Agency colors.
