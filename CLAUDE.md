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
- **Site:** on the south side (facade z = 0, the left side seen from the porch) there is a 1.5 m paved side path (plan z −1.5..0), a 1.8 m boundary wall (z −1.7..−1.5, y −0.3..1.5), and beyond it a ditch (z −3.4..−1.7). The ground box is split around the ditch. The wall runs past the walking BOUNDS, so the ditch can't be reached.
- **Main entrance (x = 1.1, plan z 0.975–4.175):** a dark-aluminium and smoked-glass double door with gold leading (`goldGrid`), corner ornaments (`cornerOrn`) and long gold bar handles. It has fixed 0.7 m side lights and a transom up to 2.42 m, which stays under the porch soffit at 2.44. `door()` takes an optional `deco` that builds a decorated leaf. With `deco`, the leaf mesh is a thin glass pane and every added mesh is tagged as clickable.
- **Window styles (by index in `WIN`):**
  - `AWNING`: the kitchen window, one top-hung sash.
  - `TRIPLE`: the living room and P. thờ. Two side casements (28% each) with mullions, plus a top-hung middle sash.
  - Every other window: two casements.
  - Every window is dark aluminium (`winFrame`) with blue-grey glass. Each sash has its own aluminium border from `sashFrame()`, and those meshes are part of the clickable leaf. Windows at least 1.1 m tall get a fixed 0.28 m transom light at the top.
  - `casement()` and `awning()` build the sashes. An awning is an outer group that turns local x along the wall, holding a pivot `Leaf` with `axis: 'x'`. The frame-loop `ease` rotates around `l.axis ?? 'y'`.
- **Wardrobes:** `wardrobe()` builds a hollow carcass (clothes rail, shelves), four hinged doors and one invisible solid covering its footprint. They live in `house.wardrobes` (same `Win` shape as windows) and are toggled with `setWin`. `wineCabinet()` (living-room corner by the TV partition) also goes in `house.wardrobes`. Each cabinet's `half` (front half-width) and `name` drive the reach distance in `nearest()` and the E prompt text. The wine cabinet continues the TV unit's line (x 5.45–5.95, z 0.28–0.95) and faces the living room (−x), like the TV wall. It is as tall as the partition (`vh`), and a filler plus a top rail join it to the partition. It is built in local u/v coords, which `P()` maps to plan coords. The single glass door is hinged at the facade-wall end.
- **Study desks:** `desk(x0,x1,zw,s)` builds a 1 m desk under each bedroom window, with a chair registered as a `'desk'` seat.
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

### Editable layout (Cài đặt) and database

- **Plan coordinates:** `src/engine/layout.ts` holds `Layout` (`rooms[key].dw/dd` deltas and `objects[id]` size/offset overrides) and `PlanMap`, which maps default plan coordinates to edited ones on each axis.
- **Rigid and elastic spans:** each axis is cut at rigid spans. Those are `WALL_RIGID_X` / `WALL_RIGID_Z` (wall thickness), plus the current door and window openings, computed per layout. Rigid spans never change length. A room delta is spread over the elastic spans inside that room's `ROOM_DIMS` rect. **When you add a wall, update `WALL_RIGID_*`.**
- **Doors and windows:** defined in `DOOR_SPECS` / `WIN_SPECS` in layout.ts, each with an id, label and default size. `Layout.openings[id]` overrides `w`, `h` and, for windows, `sill`; `doorEff` / `winEff` apply them. A door keeps its hinge side, a window keeps its centre, and the main door's `w` is both leaves. In house.ts, walls are continuous (`WALLS`), and every door and window is cut out as a hole by `wallWithHoles`, so lintels come for free.
- **Structure vs. furniture in `buildHouse(world, map, layout)`:** `box()` and `cyl()` map structure point by point; window, door, label and roof positions call `mx` / `mz` explicitly. Furniture is built inside `obj(id, label, room, scalable, build)` in default coordinates (use `add()`, not `scene.add`). It is then moved with the wall it is closest to and scaled by the override. Rects, seats, beds and wardrobes recorded inside it are transformed the same way. Objects with hinged leaves (wardrobes, wine cabinet) are `scalable: false`.
- **Rebuild:** `Game.setLayout()` disposes `house.root` and the dims overlay, then rebuilds the house, dims, minimap and bounds (about 40 ms). `rooms.ts` uses `setRoomMap()`. Room figures shown are the plan figures plus the edit (`PlanMap.roomSize`).
- **Persistence:** `src/db.ts` talks to Supabase REST (table `house_layouts`, row `id = 'main'`; schema in `supabase/schema.sql`, RLS lets anyone read and write, as the owner chose). It uses only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from `tham-quan-nha/.env.local` (gitignored; see `.env.example`). Never put the secret key in the app. Reset asks for confirmation, then deletes the row.
- **Chat and edit log:** table `house_chat` (`supabase/chat.sql`). Rows have `kind` `'message'` or `'log'`, plus name, content and `created_at`. Anyone may insert or read; no update or delete. `components/Chat.tsx` polls every 8 s and shows newest first. On Save / Reset, App calls `describeChanges(savedLayout, newLayout, game.objects)` from `engine/changes.ts` and posts the text from `logText()` as a `'log'` row under the editor's name (stored in localStorage `tqn-name`, shared by the chat and the "Người sửa" field in Settings). The log lists what was edited and what it affected: rooms that stretched along, house size, furniture that moved with the walls (computed from `ObjInfo.box` via `PlanMap.anchor`), and walls re-cut around resized openings.
- **Roofs:**
  - **Overrides:** `Layout.roof` (main) and `Layout.subRoofs.tho` / `.sanh` each take `{l, w, h}`: length along x, width along z (both incl. overhang), and rise from eaves to ridge.
  - **Geometry:** `PlanMap.roofs` returns each roof's rectangle in edited coords plus its own slope `t` (default 30°).
    - Main roof: the left edge stays at x 0.2 and the width stays centred.
    - Sub roofs: the end at x 4.0 (inside the main roof) stays put, and the length grows east. Thờ widens north and sảnh widens south.
  - **Fascia and soffits:** built with `noMap = true`, because their coordinates are already in edited space.
  - **Thờ roof clipping:** it is clipped (plane, plus `hip(..., capTo)` for the ridge cap) where its ridge meets the main roof's east face, so a steeper one doesn't poke through. The sảnh roof keeps its older two-plane clip.
- **Walls under roofs:** `underRoof()` is used for wall segments in `wallWithHoles` and for the top bands. It keeps a box 3 cm under `roofAt(x, z)`. Within 0.6 m of the main roof's east edge that is the lowest roof covering the point, because the valleys between the roofs are open there. Elsewhere it is the highest roof, so the porch roof's thin strip over the facade wall doesn't pull that wall down and leave a gap. Where a roof is lower than the wall top, the box is cut into 0.25 m pieces, so the east wall ends never poke through the low sub roofs, including after roof edits. The thờ front fascia is skipped where the sảnh roof overlaps it.
- **Mouldings and colours:**
  - **Phào trên:** `band`, a 0.5 m strip under the eave soffit. **Phào dưới:** `plinth`, from the foundation to 0.45 m. Both are 4 cm proud of the outside walls and built with `wallWithHoles`, so they are cut around doors and windows.
  - **Colours:** `Layout.colors[key]` (keys in `COLOR_SPECS` in layout.ts, defaults from the client's reference photo), read via `PlanMap.color()`. They cover walls, both mouldings, roof tiles (ridge caps and finials derived darker), fascia, porch columns and window frames. Settings has a "Màu" tab.
- **Eave heights:** all three roofs share one eave height (`E1 = E2 = E3 = 3.5`), so the white fascia, porch beam and top moulding run in one straight line from the front of the porch to the back, as in the reference photo. The porch columns go up to `PC = E3 - 0.62`, with the beams from `PC` to the soffit.
- **Mirror (Cài đặt → Đảo ngược):** `Layout.mirror` flips the house front-to-back. `house.root` holds `scene` (the house, with `scale.z = -1` about `mirrorZ = mz(9) - 9`) plus the site meshes (ground, side path, boundary wall, ditch and their labels), which are moved out so they don't flip.
  - Every recorded world coordinate is flipped too: rects, seats (`face → π − face`), beds (head N ↔ S), window/wardrobe positions, rack position and clip planes.
  - `Door.mirror` makes `leafSegment` flip door segments. `setRoomMap`, `buildDimensions`, `setView` presets and `goHome` take `house.mirrorZ` into account.
  - Mirrored materials are DoubleSide, so raycasts (camera occlusion, clicks) still hit the inside-out faces.
- **Camera blockers:** door, wardrobe and window leaves all block the tour camera.
- **Hidden openings:** `Layout.openings[id].hidden` removes a door or window. It is left out of the holes, the rigid spans, the dims and the build: no leaf, the wall stays closed, and side-door steps are skipped. `wcDoors` may then hold fewer than 2. In Settings → Cửa, × hides an opening and "Hiện lại" restores it.
- **Outdoor lights (Bật đèn, key L):**
  - **Eave downlights:** built in house.ts as `row()` calls under every roof soffit, spaced `Layout.lights.spacing`, default `LIGHT_SPACING` 1.5 m. Each has an additive cone "wash" plane on the wall behind it, where there is one.
  - **Sconces and porch light:** 4 wall sconces (porch columns, both sides of the thờ window) with an up/down wash and a real PointLight. The big porch light gets a PointLight.
  - **Switching:** `Game.applyLights()` switches `house.lights` (glows, bulb colours, point intensities) and the ambience (dim hemi/sun, dusk sky). It is re-applied after every rebuild. Washes are fake, so dozens of downlights stay cheap.
  - **Settings:** the "Đèn" tab edits the spacing.
- **Chat pictures:**
  - **Storage:** public Storage bucket `chat-images` plus a `house_chat.image_url` column, both from `supabase/chat-images.sql`.
  - **Sending:** `Chat.tsx` shrinks a picture to at most 1600 px (`shrink()`), uploads it with `uploadChatImage()` (REST `/storage/v1/object`, publishable key) and stores the public URL. A message may be a picture with no text. Pictures can also be pasted.
  - **Viewing:** clicking a thumbnail opens `Lightbox`, portalled to `<body>`, because the panel's backdrop-filter traps `position: fixed`. A click toggles fit / actual size.
  - **Before the SQL is run:** `listChat` falls back to selecting without `image_url`.
- **Living-room TV (YouTube):**
  - **Rendering:** `Game` has a `CSS3DRenderer` layer under the WebGL canvas, and the renderer has `alpha: true`. `toggleTv()` puts a YouTube embed iframe (CSS3DObject) exactly on `house.tvScreen` (world bbox; the screen always faces −x) and swaps the screen material for `holeMat` (opacity 0, NoBlending), which punches a transparent hole. Anything in front of the TV still occludes the video.
  - **Input:** the canvas keeps all pointer input, so the player is driven only via `postMessage` (playVideo / unMute on load).
  - **Rebuilds:** on `setLayout` the TV is detached before the old house is disposed and re-attached afterwards.
  - **Link:** `Layout.tvUrl` (default `TV_DEFAULT_URL`), parsed by `parseYouTube`, edited in Settings → Vật thể.
  - **Controls:** "Bật tivi" in Chi tiết, clicking the TV, or E within 2.4 m in front of it.
