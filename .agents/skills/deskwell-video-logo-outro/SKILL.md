---
name: deskwell-video-logo-outro
description: >-
  Fade the Deskwell logo up over the end of a product video as an end card,
  extending the clip with black so the logo has time to be read. Use whenever
  the user supplies a video path (or a folder of them) and asks to add the
  logo to the end, fade the logo in near the end, put a logo outro / end card
  on a video, brand the end of a clip, or "do the same as the Eclipse Plus I
  video". Covers single files and batches of the seating / product videos
  under Deskwell/Products.
---

# Deskwell video logo outro

Adds the Deskwell logo as a fading end card to a product video. The look is
locked to what was signed off on `Eclipse Plus I.mp4`: the logo fades up over
the clip's own fade to black, reaches full opacity 1.2s later, and holds for
1.87s before the cut.

Everything is done by `scripts/add-logo-outro.sh`. Do not rebuild the
filtergraph by hand.

## Run it

```bash
".agents/skills/deskwell-video-logo-outro/scripts/add-logo-outro.sh" \
  --contact-sheet "$SCRATCHPAD" \
  "/path/to/Some Video.mp4"
```

Pass several paths, or a folder, to batch. A folder is scanned one level deep
for `.mp4` / `.mov`, skipping files already named `... (no logo).mp4`.

Always pass `--contact-sheet <scratchpad dir>` and then `Read` the resulting
`<name> - outro check.jpg`. That is the verification step - six frames across
the fade and hold. Do not report the job done without looking at it.

Use `--dry-run` first when the user is unsure about the timing; it prints the
detected fade point and new length without writing anything.

## What it decides for you

| Thing | Default | Override |
|---|---|---|
| Fade start | auto - the frame where the source begins its own fade to black, rounded to 0.1s | `--fade-start SEC` |
| Fade length | 1.2s | `--fade-dur SEC` |
| Hold at full opacity | 1.87s | `--hold SEC` |
| Logo | `Deskwell/Identity/Logo/Logo Dark Mode.png` | `--logo PATH` |
| Logo width | 57.3% of frame width (1100px on 1920) | `--logo-width PX` |
| Quality | x264 crf 17, preset slow, main/4.1, yuv420p, faststart | `--crf N` |

New length is `fade start + fade length + hold`, so the tail is padded with
black (and silence) to suit. Frame rate, resolution, sample rate and channel
count are carried over from the source. Videos with no audio stay silent.

### Fade-start detection

`blackdetect` finds the closing black segment, then luma is walked backwards
from it while it keeps dropping. The first falling frame is the fade start.
On the reference clip that gives 28.967s, rounded to 29.0s.

If the clip does **not** end on black, the script says so and adds its own
`fade=t=out`, so the logo does not hard-cut from picture to black. That added
fade is deliberately **short** - `fade length / 3`, capped at 0.4s - and starts
at `duration - 0.4s`, costing 0.4s of visible content.

Do not "tidy" that up by matching it to the 1.2s logo fade. The reference clip
dipped to black in 0.33s while the logo took 1.2s, so the logo was only ~25% up
when the frame went black and the rest of its fade played on clean black. Run
both fades at the same length and a half-opacity logo sits over a half-lit
frame, which is illegible on the light-background clips - and a lot of the
Seating Videos set ends on white cyclorama (measured YAVG 150-215).

## Safety

- The original is never destroyed. It is renamed `<name> (no logo).<ext>` and
  the new cut takes the original filename, so anything referencing the video by
  name keeps working.
- A file that already has a `(no logo)` sibling is **skipped**, so re-running
  over a folder is safe. `--force` overrides.
- The output is length-checked before the original is moved. If encoding fails
  the source is left alone.

## Gotchas

- **The Homebrew arm64 ffmpeg is usually broken** on this machine - an x265
  bump leaves `dyld: Library not loaded: libx265.215.dylib`. The script probes
  each candidate with `-version` and picks a working one (currently
  `/usr/local/bin/ffmpeg`, v8.0). If it reports no working ffmpeg, that is the
  fix needed, not a script bug.
- **Light-background clips.** The dark-mode lockup is white, so during the fade
  it disappears against a white or pale background. It resolves fine once the
  frame reaches black, but if the user wants it legible throughout on a light
  clip, pass `--logo ".../Identity/Logo/Logo.png"` (the dark teal version) -
  though that one then vanishes against the black tail. Raise the trade-off
  rather than picking silently.
- `Logo Text.png` has no alpha channel. Never use it here.

## Reporting back

State: detected fade start, new length vs old, and where the backup went. Send
a Telegram ping on completion per the standing instruction, and hand the
finished video to the user with `SendUserFile`.
