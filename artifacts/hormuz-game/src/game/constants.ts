export const MAP_WIDTH = 3200;
export const MAP_HEIGHT = 1600;

export const SHIP_LENGTH = 36;
export const SHIP_WIDTH = 16;

// ── Realistic ship physics — slow, heavy, tanker-class ────────────────────────
// Map scale: 3200px ≈ 160 km water → 1 px ≈ 50 m
// At MAX_SPEED 0.90 px/frame × 60 fps = 54 px/s ≈ 2.7 km/s (compressed game time)
// Full strait crossing ~59 s real-time — feels like a heavy freighter
export const MAX_SPEED      = 0.90;
export const REVERSE_SPEED  = 0.35;
export const ACCELERATION   = 0.016;
export const DRAG           = 0.991;
export const ROTATION_SPEED = 0.011;
export const ANGULAR_DRAG   = 0.80;

export const SYNC_RATE_MS = 33;

// ── Zones (updated for new map geography) ─────────────────────────────────────
export const START_ZONE  = { x: 50,              y: 540, w: 200, h: 580 };
export const FINISH_ZONE = { x: MAP_WIDTH - 245, y: 500, w: 200, h: 600 };

export const OIL_LOAD_ZONE    = { x: 2720, y: 580, w: 440, h: 400 };
export const OIL_DELIVER_ZONE = { x: 20,   y: 560, w: 280, h: 540 };

export const FUEL_STATION_EAST = { x: 2745, y: 618, w: 130, h: 95  };
export const FUEL_STATION_WEST = { x: 55,   y: 628, w: 130, h: 95  };

export const MINE_RADIUS        = 20;
export const COAST_GUARD_RADIUS = 36;
export const HOVER_RADIUS       = 32;
export const FUEL_REQUEST_RANGE = 220;

export const FUEL_CAPACITY   = 100;
export const FUEL_DRAIN      = 0.022;
export const OIL_CARGO_MAX   = 100;
export const OIL_BASE_PRICE  = 50;
export const FUEL_BASE_PRICE = 2;
export const STARTING_MONEY  = 500;

export const FUEL_TRANSFER_AMOUNT = 30;
export const FUEL_TRANSFER_COST   = 150;

export const CAMERA_LERP  = 0.08;
export const ZOOM_MAX     = 3.0;
export const ZOOM_DEFAULT = 0.62;
export const ZOOM_STEP    = 0.10;
export const ZOOM_MIN     = 0.30;

// Map scale for distance display: 1 px ≈ 0.05 km  (50 m)
export const PX_TO_KM = 0.05;

export const WATER_COLOR        = "#0d3b6e";
export const LAND_COLOR         = "#8c6a42";
export const FINISH_COLOR       = "rgba(74, 222, 128, 0.3)";
export const FINISH_BORDER_COLOR  = "#4ade80";
export const START_COLOR        = "rgba(251, 191, 36, 0.2)";
export const START_BORDER_COLOR   = "#fbbf24";
export const OIL_COLOR          = "rgba(234, 179, 8, 0.22)";
export const OIL_BORDER_COLOR   = "#ca8a04";
export const FUEL_COLOR         = "rgba(56, 189, 248, 0.22)";
export const FUEL_BORDER_COLOR  = "#38bdf8";
