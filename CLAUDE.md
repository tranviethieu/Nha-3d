# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Walkthrough app: `tham-quan-nha/` (React + TypeScript + Vite + three r169)

A playable tour of the same house, where a character walks through it. Run `npm install` once in `tham-quan-nha/`, then use:
- `npm run dev` to start the dev server
- `npm run typecheck` to typecheck
- `npm run build` to typecheck and build to `dist/`
- `npm run dev:mobile` to serve on the LAN so a phone on the same Wi-Fi can open it (touch joystick UI)

There are no tests.

- **Two modes in one scene (`Game.ts`):**
  - `overview` reproduces the original HTML: OrbitControls, the preset camera views (`viewWC`, `viewLavabo`, …), the roof toggle with room labels, and clicking a door or the rack to toggle it.
  - `tour` is the character walk. The "Thăm quan" button enters it and Esc exits back to the saved overview camera.

  Doors, windows and the rack keep their state across modes.
- **`src/engine/house.ts`:** the house geometry, ported from the original HTML (`buildHouse(scene)`). Its `box()` also records collision data for every top-level box, sorting each one by height:
  - top at or below 0.05 m → walkable `floors`
  - spans walking height → `solids`
  - tall and opaque → camera `occluders`

  Furniture added with `box()` therefore collides automatically. To change the layout, edit the plan-coordinate arrays here and keep them in sync with the original HTML.
- **Lights:** house.ts multiplies light intensities by `Math.PI` (and gives point lights decay 1) to match the r128 look under modern three's physically based lighting.
- **`src/engine/Game.ts`:** one imperative class that owns the renderer, the input (keyboard and pointer), player physics (axis-separated moves, 0.3 m step-up, gravity), the third/first-person camera with a wall raycast, and the door and dish-rack animation. React only talks to it through public action methods and an `onHud` callback, which fires only when the HUD state changes.
- **Doors:** only a fully closed door blocks movement (`collision.ts`). Bumping into one opens it.
- **Windows:** unlike the original (glass drawn over solid walls), `wallWithHoles()` cuts each `WIN` opening out of the walls and WC tiles. Each window gets two outward-opening sashes, using the same `Leaf` hinge model as doors.
- **Beds:** `bed()` records the beds in `beds`, and `lieDown()` lays the character face-up with its head at the headboard.
- **Orientation (per the client):** the porch/sảnh side (plan x = 0) faces **east**, and the x = 14 wall faces **west**. The west wall has a window beside the washing machine and one beside the P. ngủ 3 bed. New windows are appended to `WIN`; don't reorder it, because `AWNING` is an index.
- **Kitchen window (`AWNING` index in `WIN`):** a single top-hung sash. Its `Leaf` has `axis: 'x'`, so it swings out from the bottom. The frame-loop `ease` rotates around `l.axis ?? 'y'`.
- **Wardrobes:** `wardrobe()` builds a hollow carcass (clothes rail, shelves), four hinged doors and one invisible solid covering its footprint. They live in `house.wardrobes` (same `Win` shape as windows) and are toggled with `setWin`.
- **Seats:** `seat()` records kitchen chairs, sofa places and armchairs as hip positions plus a facing direction. `sitDown()` uses `restPose(…, true)`, which bends the knee joints (`kneeL`/`kneeR` in character.ts). `this.lying` holds both poses (`kind: 'lie' | 'sit'`).
- **`nearest()`** weights candidates by whether the character is facing them. That lets the wardrobe win over the bed in the narrow gap between them.
- **Third-person camera:** collides with door and wardrobe leaves as well as `occluders`.
- **WC tile skins:** the WC tile layers are split at the doorways. In the original they ran across the openings, which blocked entry.
- **`src/engine/dimensions.ts`:** the "Kích thước" overlay. `ROOM_DIMS` holds the real sizes and areas from the client's floor plan (14 × 9 m, facade at plan z = 0). Treat those numbers as the source of truth rather than recomputing them from the model. The cards are flat on the floor with depthTest off, and `faceCamera()` turns them in 90° steps every frame so they stay upright.
- **`src/engine/rooms.ts`:** hand-written room rectangles in plan coordinates, used for the HUD room name and to auto-hide the roof.
- **`src/App.tsx`, `src/components/`:** the HUD, the toast and the touch joystick. `TouchControls` is shown when `(pointer: coarse)` matches.

## Overview

The whole project is one self-contained HTML file, `mo_hinh_3d_nha_ve_sinh_sen_lavabo.html`. It is an interactive Three.js 3D model of a 9 × 14 m single-storey house: WC1/WC2 with standing showers, a double lavabo with a mirror, a kitchen with a lift-down dish rack, a TV wall, doors you can open, and a hip roof you can toggle. All UI text is in Vietnamese.

There is no build, no package manager and no tests. To run it, open the file in a browser (`open mo_hinh_3d_nha_ve_sinh_sen_lavabo.html`). It needs network access for the CDN scripts.

## File layout

- **Lines ~1–3386:** a large exported design-system stylesheet (CSS tokens such as `--surface-1`, `--text-secondary`, `--bg-neutral`, plus button styles). It is boilerplate and has nothing to do with the model, so don't edit it unless you are changing the page styling.
- **`<body>`:** the `#wrap` canvas container (fixed at 520px tall) and a row of control buttons (`wcBtn`, `lavBtn`, `kitBtn`, `tvBtn`, `roofBtn`, `doorBtn`, `rackBtn`, `perspBtn`). They use Tabler icon-font classes (`ti ti-*`).
- **Scripts:** Three.js **r128** plus the legacy `examples/js/controls/OrbitControls.js`, both from jsdelivr. Because these are globals, `THREE.OrbitControls` is used directly and there are no ES modules. Keep the version at r128, since newer versions dropped `examples/js`.
- **The final inline `<script>`:** all of the scene code, written as dense one-liners.

## Scene code conventions

- **Coordinates are in plan meters.** The house covers x ∈ [0,14] and z ∈ [0,9]. `box()`, `cyl()` and the other helpers subtract `(7, 4.5)` to center the house at the world origin, so pass plan coordinates and don't pre-offset them. The y axis is height, with floor at 0 and wall height `H=3.6`.
- **`box(x0,z0,x1,z1,y0,y1,mat,edges=true,edgeMat,parent)`** is the main primitive. It builds an axis-aligned box from plan extents and can draw an edge outline. Its argument order is x0, z0, x1, z1 first, then y0, y1.
- **Data-driven geometry:** floors, walls, lintels above openings, windows and tiles are arrays of `[x0,z0,x1,z1,…]` passed through `forEach(box)`. To move a wall or opening, edit those arrays. Wall gaps (door openings) are filled above 2.1 m by the lintel array.
- **Groups:**
  - `roofG` holds the hip roof built by `hip()`, the fascia, and the `finial()`s. `setRoof(on)` toggles the roof and swaps visibility with the room `labels`, which are canvas sprites from `label()`.
  - `rackG` and `rackParts` hold the kitchen dish rack. `armL`/`armR` are its arms.
- **Interactivity:**
  - **Doors:** `door()` returns objects `{g, open, o, c, t}` that are collected in `doors`. `wc1` and `wc2` are the WC doors.
  - **Clickables:** meshes in `clickables` carry `userData.door` or `userData.rack` and are picked by a raycast on pointerup. A drag of more than 5px is ignored.
  - **Animation:** the render `loop()` eases door rotation toward `o.t` and the rack toward `rackDown` via `rackT`. State changes only set targets, and the loop does the animating.
- **Camera presets:** `wcView`, `lavView`, `kitView`, `tvView` and the perspective button all call `setView(position, target)` with world coordinates, which are already offset (not plan coordinates). `wcView()` is the initial view.
