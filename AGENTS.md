# AGENTS.md — Global AI Agent Operating Rules & Guidelines

> **MANDATORY FOR ALL AI AGENTS & LLMs:**
> Any AI agent, LLM assistant (e.g., Gemini, Claude, OpenAI/ChatGPT, Cursor, Windsurf, Copilot, Cline, Roo, Antigravity, Aider, etc.), or automated tool modifying or interacting with this codebase **MUST read and strictly comply** with this document before reading or writing any code.

---

## 🎯 Core Principles & System Philosophy

1. **Notion as the Universal CMS:**
   - Notion is the single source of truth and the universal Headless CMS controlling almost all content, data, dynamic pages, configuration toggles, and visual structures of this portal.
   - The application relies on the **Notion PageBuilder layout engine & Universal Registry** pattern (`lib/notion-builder.ts`, `Registry.tsx`) rather than hardcoded static JSX pages.

2. **Strict Notion API Version (`2026-03-11`):**
   - The Notion API version **MUST ALWAYS be `2026-03-11`**.
   - **NO older Notion API versions are allowed anywhere** in the codebase, fetch scripts, or integrations.

3. **Data Gathering & Sync Workflow (`pnpm fetch-notion`):**
   - Whenever the user instructs to gather, sync, or refresh data from Notion, the agent **must execute `pnpm fetch-notion` first**.
   - **Environment Requirement:** The fetch script (`scripts/notion-roaming-fetcher.ts`) relies on `.env.local` containing `NOTION_INTEGRATION_TOKEN` and `NOTION_DATABASE_REGISTRY_ID`.
   - **Vercel Setup:** If environment variables are missing or out-of-sync, Vercel CLI login (`vercel login`) and manual project linking (`vercel link`) are required to pull the latest environment variables (`vercel env pull .env.local`).

---

## 🏗️ The A-B-C Notion CMS Architecture

To prevent the application from breaking when Notion schemas drift, column names are renamed, or database IDs change, this project strictly adheres to a 3-layer architecture:

```
┌────────────────────────────────────────────────────────┐
│ Layer A: The Scanner (scripts/notion-roaming-fetcher)  │
│ Scans Notion Registry → Outputs to scratch/scaffolds   │
└──────────────────────────┬─────────────────────────────┘
                           │ (pnpm fetch-notion)
                           ▼
┌────────────────────────────────────────────────────────┐
│ Layer B: The Glossarium (lib/glossarium/)               │
│ Strongly-typed developer contract (IDs, Prop Names)    │
└──────────────────────────┬─────────────────────────────┘
                           │ (Exports constants)
                           ▼
┌────────────────────────────────────────────────────────┐
│ Layer C: The Builder (lib/notion-builder.ts & UI)      │
│ Dynamic PageBuilder & components consume Layer B       │
└────────────────────────────────────────────────────────┘
```

### 1. Layer A: The Scanner (`scripts/notion-roaming-fetcher.ts`)

- Crawler script that connects to Notion using API version `2026-03-11`.
- Scans all databases, properties, relation targets, and options registered in the master Registry database.
- **Run command:** `pnpm fetch-notion`
- Outputs schema JSON and code scaffolds to `scratch/glossarium-scaffold/` and `scratch/notion-registry-glossary.md`.

### 2. Layer B: The Glossarium (`lib/glossarium/`)

- Developer contract containing hardcoded, strongly-typed constants for database IDs, property names, relations, and components.
- **Strict Rule:** NEVER edit files outside of `lib/glossarium/` to change database/property mappings. Always update constants here.

### 3. Layer C: The Builder (`lib/notion-builder.ts` & React components)

- Page layout compilation engine and frontend views (e.g., `Registry.tsx`, `faq.ts`, `Sekretariat`, `Karya`, etc.).
- **Strict Rule:** NEVER import raw string IDs or hardcoded property names directly in Layer C components. They must strictly consume constants from Layer B (`@/lib/glossarium`).

### 🛠️ Step-by-Step Schema Change Workflow

When Notion database structures or properties change:

1. Run `pnpm fetch-notion` to crawl changes and generate scaffolds in `scratch/`.
2. Inspect changes in `scratch/notion-registry-glossary.md`.
3. Update Layer B (`lib/glossarium/`) with new/updated properties or IDs.
4. Adapt Layer C (React/API files) to consume updated variables from Layer B.

---

## 💻 Tech Stack & Configuration

- **Framework:** Next.js 16.1.6 (App Router)
- **Styling:** Tailwind CSS v4.1.18, Vanilla CSS
- **Animations:** GSAP v3.14.2 (primary timeline/stagger engine) & Motion v12.34.3 (simple physics transitions)
- **CMS / Data Source:** Notion API (Data Sources paradigm, Notion API Version `2026-03-11`, SDK v5.20+)
- **Storage / Realtime:** Supabase (storage buckets and realtime sync)
- **AI Integration:** Groq API (Llama 3) for text refinement

---

## 🎨 Design Language & Visual Standards

All UI decisions must strictly match these visual specifications:

### 1. Color System

- **Page Background:** `#0a0a0a`
- **Surface Elevated:** `bg-white/2` to `bg-white/5` (glassmorphism/panels)
- **Border Default:** `border-white/6` to `border-white/10` (sharp, no-radius dividers)
- **Border Interactive:** `border-gold-500/30` (hover/focus borders)
- **Primary Gold Accent:** `#ff6501` (`gold-500` - primary CTAs, links)
- **Active Gold Text:** `#ffa07a` (`gold-300`)
- **Text Color:** `text-white` (headings/primary), `text-neutral-400` (body copy)

### 2. Typography

- **Sans-Serif (Body):** `Inter` (`font-sans`)
- **Serif (Headings):** `Playfair Display` (`font-serif`)
- **Page Title Scale:** `font-serif text-5xl md:text-7xl`
- **Section Heading Scale:** `font-serif text-3xl md:text-4xl`

### 3. Border Radius Policy

- **Interactive elements (buttons, inputs, dropdowns):** `0.5rem` (`style={{ borderRadius: "var(--radius-action)" }}`)
- **Layout Containers & Cards:** `0` (Strictly **sharp edges**, no rounded corners)
- **Pills/Badges:** `rounded-full`

### 4. Icon Policy

- **NO icon libraries** (no Lucide-react or FontAwesome directly imported in client components).
- **NO emojis** in rendered UI.
- All icons must be hand-crafted inline SVGs defined in `components/Icons.tsx` (14x14 or 16x16, `strokeWidth={1.5}`, inheriting `currentColor`).

### 5. Stacking Context (Z-Indices)

- Navigation Menu: `z-50`
- Global Footer: `z-10`
- Main Content Container: `z-3`
- Ambient Background/Canvas Particles: `z-1`

### 6. Select / Dropdown Standard

All `<select>` elements must hide browser defaults and use the custom styling pattern:

```tsx
<div className="group relative">
  <select
    className="w-full appearance-none border border-white/10 bg-[#111] px-4 py-2 text-neutral-300 focus:border-gold-500 focus:outline-none"
    style={{ borderRadius: "var(--radius-action)" }}
  >
    <option value="...">Option</option>
  </select>
  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4 text-gold-500/60 transition-colors group-focus-within:text-gold-300">
    <IconChevronDown />
  </div>
</div>
```

### 7. Notion Image Proxy Rule

**Never use raw Notion S3 URLs directly** in images (they expire in 1 hour).

- Always wrap Notion image URLs using the proxy route: `/api/notion-image?url=${encodeURIComponent(rawUrl)}`.

---

## 🎬 Animation System (GSAP & Motion)

Entrance animations are driven by ScrollTrigger and coordinated via standard HTML `data-animate` attributes:

| Attribute                     | Description / Usage                  |
| ----------------------------- | ------------------------------------ |
| `data-animate="up"`           | Entrance animation (slide up + fade) |
| `data-animate="fade"`         | Entrance animation (fade only)       |
| `data-animate="left"`         | Entrance animation (slide from left) |
| `data-animate-delay="0.1"`    | Stagger delay in seconds             |
| `data-animate-duration="0.8"` | Animation speed in seconds           |
| `data-animate-stagger="0.1"`  | Auto-stagger children elements       |
| `data-animate-scroll="true"`  | Trigger on scroll into viewport      |

---

## 🧱 Section Layout Standards

### 1. Section Header Convention

Consistent visual header style for sections:

```tsx
<div className="mb-6 flex items-center gap-4">
  <span className="block h-px w-8 bg-gold-500/40 md:w-12" aria-hidden="true" />
  <p className="text-sm font-medium text-gold-500">Section Label</p>
</div>
```

### 2. Interactive States Styling

- **Default:** `border-white/10 text-neutral-400`
- **Hover:** `hover:border-gold-500/30 hover:bg-gold-500/8 hover:text-white`
- **Active / Selected:** `border-gold-500/30 bg-gold-500/8 text-white`
- **Disabled:** `disabled:cursor-not-allowed disabled:opacity-25`
- **Focus (inputs):** `focus:border-gold-500 focus:ring-1 focus:ring-gold-500`

### 3. Schema Documentation Policy

To keep generated Markdown documentation readable and prevent table layouts from breaking:

- **Relation Columns:** Format as `[N relations]` or item count instead of raw comma-separated UUID lists in visual tables.
- **Cell Truncation:** Truncate text cells to maximum `60` characters in Markdown tables.
- **Raw Data:** Always preserve 100% complete, raw, untruncated IDs and values in `scratch/notion-registry-dump.json` and generated developer scaffolds (`components.ts`).
