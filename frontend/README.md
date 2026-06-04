# SignBridge AI

SignBridge AI is a web application that converts English text into sign animation using a 3D avatar.

## Current Scope

- Text input and playback controls
- 3D avatar rendering with React Three Fiber
- Dictionary-based signs plus fingerspelling fallback
- Local avatar asset loading from `public/avatar.glb`

## Tech Stack

- React + Vite
- Three.js + `@react-three/fiber` + `@react-three/drei`
- Zustand
- Tailwind CSS

## Prerequisites

- Node.js 20+
- npm 10+

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

## Avatar Setup

1. Place your avatar file at `public/avatar.glb`.
2. Ensure the skeleton uses Mixamo-style `mixamorig...` bone names.
3. Start the app and verify movement in the translator panel.

## Scripts

```bash
npm run dev      # Start development server
npm run build    # Create production build
npm run lint     # Run ESLint
npm run preview  # Preview production build locally
```

## Project Structure

```text
src/
	avatar/         # Bone map, animator hook, avatar runtime
	signs/          # Handshapes, dictionary signs, fingerspelling helper
	features/       # UI feature modules (translator and avatar panel)
	components/     # Shared UI and layout components
	pages/          # Route-level pages
docs/             # Product and technical documentation
public/           # Static assets including avatar.glb
```

## CI

GitHub Actions runs lint and build on pushes and pull requests to `main`.

## Contributing

Please read `CONTRIBUTING.md` before opening a pull request.

## Security

Please report vulnerabilities using `SECURITY.md`.
