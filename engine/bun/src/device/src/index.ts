export type { Accuracy, Adapter, Agent, Battery, Capability, Combo, Contrast, Device, Follow, Full, Grant, Haptic, Hints, Host, Hotkey, Info, Insets, Key, Media, Network, Notice, Options, Orientation, Permission, Pick, Picked, Platform, Pointer, Position, Scheme, Shared, Source, Stream, Watched } from "./arch.ts";
export { create, targetOf } from "./device.ts";
export { orientationOf, parseAgent, unknownInfo } from "./info.ts";
export { combo, combos, describe, matches } from "./keys.ts";
export { bindWeb, port, unknown } from "./port.ts";
export { webAdapter } from "./web.ts";
