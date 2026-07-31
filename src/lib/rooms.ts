/**
 * The library rooms typically reserved for meetings, positioned as
 * percentage-based hotspots over the SNE upper-level floor plan
 * (public/rooms/sne-upper-level.png) for the click-to-assign map in
 * Admin > Rooms. 324/326/328/330/332 are the usual rooms; 308/309/310
 * come up less often but are still on the same floor. Anything not on
 * this list is still bookable via "Other" (free text).
 */
export interface RoomHotspot {
  name: string;
  top: number;
  left: number;
  width: number;
  height: number;
}

export const ROOM_HOTSPOTS: RoomHotspot[] = [
  { name: "324", top: 61.5, left: 84.14, width: 9.06, height: 4.5 },
  { name: "326", top: 66.0, left: 84.14, width: 9.06, height: 5.0 },
  { name: "328", top: 72.0, left: 84.14, width: 9.06, height: 4.0 },
  { name: "330", top: 76.0, left: 84.14, width: 9.06, height: 5.0 },
  { name: "332", top: 81.5, left: 71.52, width: 12.62, height: 6.5 },
  { name: "308", top: 58.0, left: 11.65, width: 6.47, height: 4.0 },
  { name: "309", top: 57.5, left: 5.18, width: 6.47, height: 4.5 },
  { name: "310", top: 50.75, left: 5.83, width: 8.74, height: 6.25 },
];

export const ROOM_MAP_IMAGE = "/rooms/sne-upper-level.png";
export const ROOM_MAP_IMAGE_WIDTH = 1545;
export const ROOM_MAP_IMAGE_HEIGHT = 2000;
