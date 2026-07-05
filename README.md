# Crispen

Turn AI-generated images into production-ready files — vector paths, correct
colour, right resolution. A press check for AI art, for freelancers, in-house
creative teams, and studios handing an AI concept to production.

This repo is the **pre-release site**: a waitlist landing page plus an early
build of the press-check tool.

## Stack

- [Next.js 14](https://nextjs.org/) (App Router) + React 18 + TypeScript
- Tailwind CSS for the tool UI; scoped hand-written CSS for the landing page
- [sharp](https://sharp.pixelplumbing.com/) + [potrace](https://www.npmjs.com/package/potrace)
  for raster analysis and vectorization

## Getting started

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## Layout

| Path                     | What it is                                             |
| ------------------------ | ------------------------------------------------------ |
| `app/page.tsx`           | Waitlist landing page (hero, demo, reject report, CTA) |
| `app/app/page.tsx`       | The press-check / vectorize tool                       |
| `app/api/waitlist/`      | Email capture — persists to `.data/waitlist.json`      |
| `app/api/analyze/`       | Image analysis (colour mode, DPI, dimensions)          |
| `app/api/vectorize/`     | Raster → SVG tracing                                   |
| `components/CrispenLogo` | The bright focus-pull wordmark                          |

## Waitlist storage

Signups are appended to `.data/waitlist.json` (gitignored). It's a flat file for
pre-launch validation — swap the read/write pair in `app/api/waitlist/route.ts`
for a hosted store or an email provider before driving real traffic.
