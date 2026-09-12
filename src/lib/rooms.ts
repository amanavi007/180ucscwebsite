/**
 * The floor plan image for the click-to-assign room map in Admin > Rooms.
 * The clickable room hotspots themselves live in the `room_hotspots` table
 * (see src/lib/data/room-hotspots.ts) instead of being hardcoded here, so
 * exec can reposition/add/remove rooms from the UI without a code change.
 */
export const ROOM_MAP_IMAGE = "/rooms/sne-upper-level.png";
export const ROOM_MAP_IMAGE_WIDTH = 1545;
export const ROOM_MAP_IMAGE_HEIGHT = 2000;
