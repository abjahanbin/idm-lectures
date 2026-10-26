# Week 10 Slides: Build Brief

Build the Week 10 lecture deck in `week10/index.html` (and `week10/main.js` if needed). This week launches the final project. The deck covers four things in order: a brief recap of what the class has covered so far, what the final project is, the concept presentation assignment, and an in-class ideation exercise done entirely on paper, with no Unreal.

The slide copy below is final. Use it word for word unless something doesn't fit on a slide, and tell me if you had to change any wording.

---

## 1. Read these first

Before writing anything, read these to learn the conventions:

- `week01/index.html` + `week01/main.js`: the fullest example. Title/divider slides, the breakout stacks (vertical `<section>` groups with `data-bg` + `data-bg-rotate`), `.impact-statement` quotes, `.tools-stack` lists, the Project 1/2/3 preview slides, and the Break slide.
- `week08/index.html` + `week08/main.js`: the most recent deck, including the screenshot layer.
- `shared/reveal-init.js`: how `data-movement`/`data-movement-name` drive the bottom bar, and how `.divider` + `data-bg` pick the animated background.
- `shared/theme.css`: all existing classes. Reuse them before inventing new ones.

## 2. Conventions to follow

- Every top-level `<section>` gets `data-movement="N"` and `data-movement-name="..."` (the title slide gets no name, same as week01/week08).
- Set `--divider-color` inline to match the movement's bar color. The cycle in `reveal-init.js` is: movement 1 yellow, 2 blue, 3 green, 4 teal, then repeating.
- Slide patterns to reuse:
  - Title/section dividers: `.impact-slide.divider` with an `h1`/`h2`, optional `data-bg="perlin-noise" | "truchet" | "rule30"` (voronoi is the default)
  - Term/heading slides: `h3.title-highlight` + `p.impact-byline`
  - Big statements: `p.impact-statement` (+ `.quote-mark`, `cite.quote-cite` for quotes)
  - Short lists: `.tools-stack` with `span.bio-role.bg-yellow|bg-blue|bg-green|bg-pink|bg-teal` items; `.tools-stack.two-column` for longer lists
  - Break: `data-background-color` on an empty `.impact-slide`
- Keep the existing comment style: a numbered HTML comment above each slide saying what it is and why it's built that way.
- **Keep text minimal.** These decks are mostly big single statements; the instructor talks over them. One idea per slide. If a slide below has too much text to fit at 960×700 without shrinking, split it into two slides rather than shrinking the type.
- New CSS: only add new **opt-in** classes, appended at the end of `shared/theme.css` with a comment, and don't change existing rules (other weeks depend on them). Prefix new classes with something week-agnostic so they can be reused later.
- No new npm dependencies.
- Assets: use the `new URL(..., import.meta.url)` pattern from week08 so `vite build` bundles them.

---

## 3. Deck outline and copy

### Movement 1: Title

**1. Title slide** (divider, same as week08 slide 1)
- `h1`: Interactive Digital Media
- byline: Week 10

### Movement 2: Where We've Been (`data-movement-name="Recap"`)

Keep this short: three slides, a quick reminder before the final project. Don't show student work here.

**2. Divider:** "Where we've been"

**3. So far** (`h2` + `.tools-stack`)
- `h2`: So far
- items: Emergence &mdash; Niagara · Shaders &mdash; procedural textures · Audio synthesis &mdash; MetaSounds

**4. Bridge statement** (`.impact-statement`)
- "Next: one instrument."

### Movement 3: The Final Project (`data-movement-name="Final Project"`)

**5. Divider:** "Final Project"

**6. Title-highlight slide**
- `h3`: An Instrument of Memory
- byline: Recreate how a specific moment from your life felt

**7. Statement** (`.impact-statement`)
- "Not what it looked like &mdash; how it felt."

**8. What it includes** (`h2` + `.tools-stack`)
- `h2`: Your instrument
- items: Sound &mdash; MetaSounds · Visual &mdash; Niagara / Material · An Input · A Connection · A 2&ndash;3 Minute Performance

**9. Example memory** (`.impact-statement`, use `.text-compact` if needed)
- "Lying awake during a summer thunderstorm at my grandmother's house."
- smaller line beneath (byline style): Safe, but on edge.

**10. Example translation:** three side-by-side columns. No existing class does this, so add a new opt-in class (e.g. `.three-col`) with a highlighted heading per column and 1–2 short lines under each:
- **Sound:** Low drone for the fan · Filtered noise for rain · A burst of notes for lightning
- **Visual:** Dark, slow swarm in deep blue · A white flash that scatters it
- **Input:** Microphone · Breath controls the rain · A sharp sound triggers lightning

**11. Inputs** (`h2` + `.tools-stack`)
- `h2`: Play it with
- items: Gamepad · Microphone · MIDI Controller
- byline under the stack: Others with approval &middot; keyboard as a secondary control only

**12. Statement** (`.impact-statement`)
- "The gesture should feel like the memory."

### Movement 4: The Assignment (`data-movement-name="Assignment"`)

**13. Divider:** "Part 1: Concept Presentation"

**14. Due date** (title-highlight)
- `h3`: Due Week 11
- byline: Monday, November 2 &middot; start of class

**15. The four steps** (`h2` + `.tools-stack`)
- `h2`: What to do
- items: 1. Choose a memory · 2. Translate it · 3. Find precedents · 4. Decide your input

**16. A moment, not a period.** Two lines stacked: the first visually struck through or dimmed, the second highlighted:
- ~~Summer at my grandmother's house~~
- Lying awake during a thunderstorm at my grandmother's house

**17. Precedents** (title-highlight)
- `h3`: 2 audio + 2 visual
- byline: Songs, artworks, films, games &middot; what are you taking from each?

**18. Presentation format** (title-highlight)
- `h3`: 5&ndash;7 slides &middot; 3&ndash;4 minutes
- byline: Memory &middot; Audio precedents &middot; Visual precedents &middot; Translation &middot; Input

**19. Submit** (title-highlight)
- `h3`: PDF on Canvas + present in class
- byline: Full details are on Canvas

### Movement 5: Break

**20. Break slide**, same as week01's (empty `.impact-slide` with `data-background-color`), `data-movement-name="Break"`.

### Movement 6: Exercise (`data-movement-name="Exercise"`)

**21. Divider** (use `data-bg="truchet"` or another non-default background)
- `h2`: Memory &rarr; Instrument
- byline: 35 minutes

**22. Statement** (`.impact-statement`)
- "You choose what you share."

**23. Step 1** (title-highlight)
- `h3`: 1 &middot; Fast list
- byline: 5 minutes &middot; alone &middot; silent &middot; five moments, one line each

**24. Prompts** (`.tools-stack`, all five visible at once so students can write while it's up)
- A time you were waiting for something
- A place whose sound you can still hear
- A moment when the weather mattered
- The first night somewhere new
- A time you couldn't sleep

**25. Step 2** (title-highlight)
- `h3`: 2 &middot; Sensory inventory
- byline: 5 minutes &middot; pick one moment

**26. Three columns** (reuse the new `.three-col` class from slide 10)
- Heard · Saw · Felt in my body
- line beneath the columns: Then name the feeling.

**27. Step 3** (title-highlight)
- `h3`: 3 &middot; Translator swap
- byline: 10 minutes &middot; pairs &middot; read your columns, not the story

**28. Vocabulary** (`.tools-stack.two-column`)
- Tempo · Rhythm · Pitch · Density · Filter · Envelope · Delay · Silence · Color · Movement · Speed · Scale · Light · Swarm

**29. Step 4** (title-highlight)
- `h3`: 4 &middot; Second draft
- byline: 10 minutes &middot; alone &middot; no software

**30. Three lines** (reuse `.three-col` from slide 10)
- Sound · Visual · Input
- line beneath the columns: Rewrite each in one line, using what your partner heard.

**31. Step 5** (title-highlight)
- `h3`: 5 &middot; Share
- byline: 5 minutes &middot; three or four volunteers

**32. Fill-in sentence** (`.impact-statement`, `.text-compact` if needed). Render the blanks as underlined gaps:
- "My memory is ____, it feels like ____, and I might play it with ____."

**33. Closing** (title-highlight)
- `h3`: Next week: concept presentations
- byline: Bring your slides &middot; test your audio clips

---

## 4. Exercise timer (nice to have)

Steps 1–5 are timed. In `week10/main.js` only, add an opt-in countdown:

- A slide marks itself with `data-timer-minutes="5"` (put it on slides 23/24, 25/26, 27/28, 29/30, 31/32 with the minutes above).
- On those slides, a small `mm:ss` readout sits in a corner, out of the way of the bottom bar, styled to match the deck (an accent color, same font).
- It does **not** start on its own. Pressing `T` starts and pauses it. Leaving the slide resets it.
- At 0:00 it turns `--accent-red` and blinks gently. No sound.
- Check that `T` isn't already bound by reveal.js; if it is, pick a free key and tell me which.

If this gets complicated, skip it and tell me. The deck matters more.

---

## 5. Check your work

1. `npm run dev`, open `/week10/`, and step through every slide, including any vertical stacks.
2. At the default 960×700 deck size, no text overflows or wraps awkwardly; the bottom bar shows the right movement names; divider backgrounds appear only on divider slides.
3. If you built the timer, test start, pause, reset on leaving, and the 0:00 state.
4. `npm run build` completes with no errors, and `week10` is in the output.
5. Tell me in a short summary: any wording you changed, any new CSS classes you added (and where), and anything you skipped.
