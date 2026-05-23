# Task: generate subtle X profile banner

Generate a 1500×500 PNG banner for X (Twitter) profile @Rexetdeus. Output: `docs/assets/x-banner.png`.

## Constraints

- **Dimensions: exactly 1500 × 500 px** (X banner aspect, displays full on most screens)
- **Filesize:** under 500 KB (X has a 2 MB limit but smaller renders faster)
- **NOT promo:** no big logos, no GitHub URL, no "TextStack" plastered across. The banner should signal "thoughtful dev with taste" — not "buy my product".
- Tone: understated, dev-aesthetic, the kind of banner a senior engineer with a quiet brand would have.

## Aesthetic — terminal/editor with a single-line comment

Dark muted background, monospace text, faded code-comment color. Like glancing at an editor where someone left one self-aware line of code.

### Visual spec

| Element | Spec |
|---|---|
| Background | Solid `#0d1117` (GitHub dark theme bg) OR subtle vertical gradient from `#0d1117` to `#161b22` |
| Text content (pick one — see options below) | A single code-comment line |
| Font | JetBrains Mono if available (`apt-get install fonts-jetbrains-mono` or download from JetBrains site). Fallback: `DejaVu Sans Mono`, then any monospace |
| Font size | 28–32 px (subtle but legible on most viewports) |
| Text color | `#6e7681` (GitHub comment color — muted, not screaming) |
| Text position | Left-aligned with 90 px left margin, vertically centered |
| Optional decoration | A faint blinking-cursor-style block `▍` at end in slightly brighter `#8b949e`. Just one character. |
| Padding around text | Generous — empty space carries the design |

### Tagline options — pick the best one (or generate variants and let user choose)

```python
TAGLINE_OPTIONS = [
    "// reading, in production.",            # plays on "X in production" trope + TextStack
    "// notes on books I keep quitting.",    # self-deprecating, honest
    "// DDIA, attempt #4. shipping the reader that fixes it.",  # specific story
    "// some books read you back.",           # introspective, no product mention
    "// .NET. React Native. Books I never finish.",  # 3-element stack signature
]
```

**Default recommendation:** `// reading, in production.` — it ties to the Gemma 4 post-mortem article (LLM in production) while staying ambiguous enough to NOT read as promo. Devs who land on the profile get the wink; others see a stylized tagline.

If unsure, generate ALL FIVE as separate files (`docs/assets/x-banner-v1.png` … `v5.png`) and let user pick.

## Implementation

Use Python with Pillow (PIL). Suggested approach:

```python
from PIL import Image, ImageDraw, ImageFont

WIDTH, HEIGHT = 1500, 500
BG = "#0d1117"
TEXT_COLOR = "#6e7681"
CURSOR_COLOR = "#8b949e"
TAGLINE = "// reading, in production."

img = Image.new("RGB", (WIDTH, HEIGHT), BG)
draw = ImageDraw.Draw(img)

# Try preferred fonts in order
font_candidates = [
    "/usr/share/fonts/truetype/jetbrains-mono/JetBrainsMono-Regular.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    # ... fall back to whatever ImageFont.load_default()
]
font = None
for path in font_candidates:
    try:
        font = ImageFont.truetype(path, 30)
        break
    except Exception:
        continue
if font is None:
    font = ImageFont.load_default()

# Vertical center
bbox = draw.textbbox((0, 0), TAGLINE, font=font)
text_h = bbox[3] - bbox[1]
y = (HEIGHT - text_h) // 2

draw.text((90, y), TAGLINE, fill=TEXT_COLOR, font=font)

# Optional cursor block at end
text_w = bbox[2] - bbox[0]
draw.text((90 + text_w + 14, y), "▍", fill=CURSOR_COLOR, font=font)

img.save("docs/assets/x-banner.png", optimize=True)
```

Adjust as needed if Pillow isn't available — use `cairosvg` or generate SVG and rasterize. Whatever works.

## Verification

After generation:

1. Open the PNG and confirm:
   - Dimensions exactly 1500×500
   - Filesize < 500 KB
   - Text is legible but quiet (NOT screaming)
   - No accidental TextStack/GitHub/promo branding
2. Render at 760×254 (X displays roughly half-size on most viewports) — text should still be readable.
3. If multiple variants generated, save all and list them in the commit message so user can choose by filename.

## Out of scope

- Don't add the TextStack logo, name, or URL to the banner.
- Don't use bright/saturated colors — the whole palette should feel like a dev tool dark theme.
- Don't put images of books, screenshots, or product visuals. Pure typographic banner.
- Don't generate multiple aspect ratios — X only needs 1500×500 for the profile banner.

## Commit message suggestion

```
chore(marketing): add subtle X profile banner

1500x500 PNG, JetBrains-Mono code-comment aesthetic.
Tagline: "// reading, in production."
No product branding — banner reads as quiet dev profile, not promo.
```
