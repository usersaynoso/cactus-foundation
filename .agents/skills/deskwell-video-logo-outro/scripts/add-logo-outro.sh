#!/usr/bin/env bash
#
# add-logo-outro.sh - fade the Deskwell logo up over the end of a product video.
#
# Extends the clip with black, fades the logo in over the source's own
# fade-to-black, and holds it as an end card. The original file is kept,
# renamed "<name> (no logo).mp4".
#
# Usage:
#   add-logo-outro.sh [options] <video.mp4> [more videos or directories...]
#
# Options:
#   --fade-start SEC   When the logo starts fading up. Default: auto-detected
#                      (the moment the source begins its own fade to black).
#   --fade-dur SEC     Length of the logo fade. Default 1.2.
#   --hold SEC         How long the logo sits at full opacity before the cut.
#                      Default 1.87.
#   --logo PATH        Logo PNG. Default: the Deskwell dark-mode lockup.
#   --logo-width PX    Logo width in pixels. Default: 57.3% of frame width
#                      (1100px on a 1920-wide frame).
#   --crf N            x264 quality. Default 17.
#   --contact-sheet D  Write a 6-frame verification JPEG into directory D.
#   --dry-run          Print the plan, touch nothing.
#   --force            Re-process a video that already has a "(no logo)" backup.
#   -h, --help         This text.
#
set -euo pipefail

LOGO_DEFAULT="/Users/chris/Git Local/Deskwell/Identity/Logo/Logo Dark Mode.png"
FADE_START=""
FADE_DUR=1.2
HOLD=1.87
LOGO="$LOGO_DEFAULT"
LOGO_WIDTH=""
LOGO_WIDTH_FRAC=0.573
CRF=17
SHEET_DIR=""
DRY_RUN=0
FORCE=0
TARGETS=()

die() { printf 'error: %s\n' "$*" >&2; exit 1; }
note() { printf '%s\n' "$*" >&2; }

usage() { sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'; exit 0; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --fade-start)    FADE_START="${2:?}"; shift 2 ;;
    --fade-dur)      FADE_DUR="${2:?}"; shift 2 ;;
    --hold)          HOLD="${2:?}"; shift 2 ;;
    --logo)          LOGO="${2:?}"; shift 2 ;;
    --logo-width)    LOGO_WIDTH="${2:?}"; shift 2 ;;
    --crf)           CRF="${2:?}"; shift 2 ;;
    --contact-sheet) SHEET_DIR="${2:?}"; shift 2 ;;
    --dry-run)       DRY_RUN=1; shift ;;
    --force)         FORCE=1; shift ;;
    -h|--help)       usage ;;
    -*)              die "unknown option: $1" ;;
    *)               TARGETS+=("$1"); shift ;;
  esac
done

[[ ${#TARGETS[@]} -gt 0 ]] || die "no video given. See --help."
[[ -f "$LOGO" ]] || die "logo not found: $LOGO"

# ---------------------------------------------------------------------------
# Pick a working ffmpeg. The Homebrew arm64 build is often broken by an x265
# bump (dyld: Library not loaded libx265.NNN.dylib), so test before trusting.
# ---------------------------------------------------------------------------
FFMPEG=""; FFPROBE=""
for cand in /usr/local/bin/ffmpeg /opt/homebrew/bin/ffmpeg "$(command -v ffmpeg || true)"; do
  [[ -n "$cand" && -x "$cand" ]] || continue
  probe="${cand%ffmpeg}ffprobe"
  [[ -x "$probe" ]] || continue
  if "$cand" -version >/dev/null 2>&1 && "$probe" -version >/dev/null 2>&1; then
    FFMPEG="$cand"; FFPROBE="$probe"; break
  fi
done
[[ -n "$FFMPEG" ]] || die "no working ffmpeg found (all candidates failed -version)"

# awk-based float helpers - bc is not guaranteed and awk is exact enough here.
fcalc() { awk "BEGIN{printf \"%.6f\", $1}"; }
fcmp()  { awk "BEGIN{exit !($1)}"; }   # returns 0 (true) when the expression holds

# ---------------------------------------------------------------------------
# expand directories into mp4/mov files, skipping our own backups
# ---------------------------------------------------------------------------
FILES=()
for t in "${TARGETS[@]}"; do
  if [[ -d "$t" ]]; then
    while IFS= read -r f; do FILES+=("$f"); done < <(
      find "$t" -maxdepth 1 -type f \( -iname '*.mp4' -o -iname '*.mov' \) \
        ! -iname '*(no logo)*' | sort
    )
  elif [[ -f "$t" ]]; then
    FILES+=("$t")
  else
    die "not found: $t"
  fi
done
[[ ${#FILES[@]} -gt 0 ]] || die "no video files matched"

# ---------------------------------------------------------------------------
# detect_fade_start <video> <duration>
#
# Finds where the source starts dimming towards its closing black. Strategy:
#   1. blackdetect gives the trailing fully-black segment.
#   2. Walk luma backwards from there while it keeps dropping meaningfully.
#      The first frame of that decline is the start of the fade.
# Prints the time, or "none" when the clip does not end on black.
# ---------------------------------------------------------------------------
detect_fade_start() {
  local v="$1" dur="$2" tblack win_start
  tblack=$(
    "$FFMPEG" -v info -i "$v" -vf "blackdetect=d=0.05:pix_th=0.10" -an -f null - 2>&1 \
      | sed -n 's/.*black_start:\([0-9.]*\).*/\1/p' \
      | awk -v d="$dur" '$1 > d - 5 {last=$1} END{if (last != "") print last}'
  )
  [[ -n "$tblack" ]] || { echo "none"; return; }

  win_start=$(awk -v t="$tblack" 'BEGIN{v = t - 4; if (v < 0) v = 0; printf "%.6f", v}')

  "$FFMPEG" -v error -ss "$win_start" -to "$tblack" -i "$v" \
      -vf "signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-" \
      -an -f null - 2>/dev/null \
    | awk -v base="$win_start" '
        /pts_time:/ { for (i=1;i<=NF;i++) if ($i ~ /^pts_time:/) { split($i,a,":"); t=a[2] } ; next }
        /YAVG=/     { split($0,b,"="); n++; T[n]=base+t; Y[n]=b[2] }
        END {
          if (n < 2) { print "none"; exit }
          # Walk back from the last sampled frame while luma keeps falling.
          # i lands on the last frame of the plateau, so the fade opens at i+1.
          i = n
          while (i > 1 && Y[i-1] - Y[i] > 1.0) i--
          if (i >= n) { print "none"; exit }   # no decline: hard cut to black
          printf "%.3f\n", T[i+1]
        }'
}

process() {
  local src="$1"
  local dir base ext backup out
  dir=$(dirname "$src"); base=$(basename "$src"); ext="${base##*.}"; base="${base%.*}"
  backup="$dir/$base (no logo).$ext"
  out="$dir/$base.$ext"

  if [[ -e "$backup" && $FORCE -eq 0 ]]; then
    note "SKIP  $base - already has a \"(no logo)\" backup. Use --force to redo."
    return
  fi

  # --- probe -------------------------------------------------------------
  local dur w h fps_raw fps has_audio arate achan
  dur=$("$FFPROBE" -v error -show_entries format=duration -of csv=p=0 "$src")
  read -r w h fps_raw < <("$FFPROBE" -v error -select_streams v:0 \
      -show_entries stream=width,height,r_frame_rate -of csv=p=0 "$src" | tr ',' ' ')
  [[ -n "${dur:-}" && -n "${w:-}" ]] || die "could not probe $src"
  fps=$(awk -F/ 'BEGIN{OFS=""} {printf "%.6f", ($2 ? $1/$2 : $1)}' <<<"$fps_raw")

  has_audio=$("$FFPROBE" -v error -select_streams a:0 -show_entries stream=index -of csv=p=0 "$src" | head -1)
  arate=48000; achan=2
  if [[ -n "$has_audio" ]]; then
    read -r arate achan < <("$FFPROBE" -v error -select_streams a:0 \
        -show_entries stream=sample_rate,channels -of csv=p=0 "$src" | tr ',' ' ')
  fi

  # --- timings -----------------------------------------------------------
  #
  # When we have to add our own fade-out, keep it SHORT (VOUT_DUR) rather than
  # matching the logo fade. The reference clip dipped to black in 0.33s while
  # the logo took 1.2s, so the logo was only ~25% up when the frame went black
  # and the rest of its fade played on clean black. Running both fades at the
  # same length instead leaves a half-lit frame under a half-opacity logo,
  # which is unreadable on the light-background clips.
  local start detected source_fades_out=1
  local VOUT_DUR
  VOUT_DUR=$(awk -v f="$FADE_DUR" 'BEGIN{v = f/3; if (v > 0.4) v = 0.4; printf "%.3f", v}')

  if [[ -n "$FADE_START" ]]; then
    start="$FADE_START"; detected="(given)"
    [[ $(detect_fade_start "$src" "$dur") == "none" ]] && source_fades_out=0
  else
    detected=$(detect_fade_start "$src" "$dur")
    if [[ "$detected" == "none" ]]; then
      # No closing fade in the source. Dissolve it out ourselves so the black
      # tail is not a hard cut, and start the logo as that dissolve begins.
      source_fades_out=0
      start=$(fcalc "$dur - $VOUT_DUR")
      detected="none - source does not fade out, adding a ${VOUT_DUR}s one"
    else
      start=$(awk -v t="$detected" 'BEGIN{printf "%.2f", int(t*10 + 0.5)/10}')  # nearest 0.1s
    fi
  fi

  fcmp "$start > 0" || die "$base: computed fade start $start is not positive"

  local total pad lw
  total=$(fcalc "$start + $FADE_DUR + $HOLD")
  pad=$(fcalc "$total - $dur")
  fcmp "$pad > 0.04" || pad=0.04   # tpad needs something to add; keep a frame

  lw="$LOGO_WIDTH"
  [[ -n "$lw" ]] || lw=$(awk -v w="$w" -v f="$LOGO_WIDTH_FRAC" 'BEGIN{v=int(w*f); print v - (v%2)}')

  printf '%s\n' \
    "$base" \
    "  source      ${dur}s  ${w}x${h} @ ${fps}fps  audio=$([[ -n "$has_audio" ]] && echo yes || echo no)" \
    "  fade start  ${start}s   [detected: ${detected}]" \
    "  logo full   $(fcalc "$start + $FADE_DUR")s   hold ${HOLD}s" \
    "  new length  ${total}s   (+${pad}s of black)" \
    "  logo width  ${lw}px" >&2

  [[ $DRY_RUN -eq 1 ]] && { note "  dry run - nothing written"; return; }

  # --- build filtergraph --------------------------------------------------
  local vchain="[0:v]"
  if [[ $source_fades_out -eq 0 ]]; then
    vchain+="fade=t=out:st=${start}:d=${VOUT_DUR},"
  fi
  vchain+="tpad=stop_mode=add:stop_duration=${pad}:color=black,format=yuv420p,setsar=1[bg];"

  local fc="$vchain"
  fc+="[1:v]scale=${lw}:-2:flags=lanczos,format=rgba,"
  fc+="fade=t=in:st=${start}:d=${FADE_DUR}:alpha=1,trim=0:${total},setpts=PTS-STARTPTS[lg];"
  fc+="[bg][lg]overlay=(W-w)/2:(H-h)/2:eval=init:format=auto,format=yuv420p[v]"

  local -a maps=(-map "[v]")
  local -a acodec=(-an)
  if [[ -n "$has_audio" ]]; then
    fc+=";[0:a]apad,atrim=0:${total},asetpts=PTS-STARTPTS[a]"
    maps+=(-map "[a]")
    acodec=(-c:a aac -b:a 320k -ar "$arate" -ac "$achan")
  fi

  local tmp; tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' RETURN

  "$FFMPEG" -v error -nostdin \
    -i "$src" -loop 1 -framerate "$fps" -i "$LOGO" \
    -filter_complex "$fc" "${maps[@]}" \
    -c:v libx264 -profile:v main -level 4.1 -preset slow -crf "$CRF" \
    -pix_fmt yuv420p -r "$fps" "${acodec[@]}" \
    -movflags +faststart -t "$total" \
    "$tmp/out.mp4" -y

  # sanity-check before we touch the original
  local newdur
  newdur=$("$FFPROBE" -v error -show_entries format=duration -of csv=p=0 "$tmp/out.mp4")
  fcmp "$newdur > $dur" || die "$base: output ($newdur s) is not longer than source - aborting, original untouched"

  mv "$src" "$backup"
  mv "$tmp/out.mp4" "$out"
  note "  done -> $out   (original kept as \"$(basename "$backup")\")"

  # --- optional contact sheet --------------------------------------------
  if [[ -n "$SHEET_DIR" ]]; then
    mkdir -p "$SHEET_DIR"
    # Qualify the sheet with its parent folder. Basenames repeat all over this
    # tree ("Upholstery Final" x3) and macOS is case-insensitive, so plain
    # basenames silently overwrite each other and you lose sheets.
    local sheet_id parent n=2
    parent=$(basename "$dir")
    sheet_id="$parent - $base"
    while [[ -e "$SHEET_DIR/$sheet_id - outro check.jpg" ]]; do
      sheet_id="$parent - $base ($n)"; n=$((n+1))
    done
    local -a times labels ins fcs
    times=(
      "$(fcalc "$start - 0.2")" "$(fcalc "$start + $FADE_DUR*0.25")"
      "$(fcalc "$start + $FADE_DUR*0.6")" "$(fcalc "$start + $FADE_DUR")"
      "$(fcalc "$start + $FADE_DUR + $HOLD*0.5")" "$(fcalc "$total - 0.08")"
    )
    local i=0
    for t in "${times[@]}"; do
      "$FFMPEG" -v error -ss "$t" -i "$out" -frames:v 1 -q:v 3 "$tmp/f$i.jpg" -y
      ins+=(-i "$tmp/f$i.jpg")
      fcs+=("[$i]scale=640:-1,drawtext=text='$(printf '%.2f' "$t")s':x=10:y=10:fontsize=28:fontcolor=yellow[v$i];")
      i=$((i+1))
    done
    local sheet_fc; sheet_fc=$(printf '%s' "${fcs[@]}")
    sheet_fc+="[v0][v1][v2][v3][v4][v5]xstack=inputs=6:layout=0_0|w0_0|0_h0|w0_h0|0_h0+h2|w0_h0+h2"
    "$FFMPEG" -v error "${ins[@]}" -filter_complex "$sheet_fc" -frames:v 1 \
      "$SHEET_DIR/$sheet_id - outro check.jpg" -y
    note "  contact sheet -> $SHEET_DIR/$sheet_id - outro check.jpg"
  fi
}

note "ffmpeg: $FFMPEG"
note "logo:   $LOGO"
note ""
for f in "${FILES[@]}"; do process "$f"; note ""; done
