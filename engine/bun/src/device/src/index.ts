export type { Accuracy, Adapter, Agent, Battery, Capability, Capture, Combo, Contrast, Device, Facts, Follow, Full, Grant, Haptic, Hints, Host, Hotkey, Info, Insets, Key, Network, Notice, Options, Orientation, Permission, Platform, Pointer, Position, Runtime, Scheme, Shared, Stream, Watched } from "./arch.ts";
export { create, pathOf, targetOf } from "./device.ts";
export { host, runtime } from "./host.ts";
export { orientationOf, parseAgent, unknownInfo } from "./info.ts";
export { combo, combos, describe, matches } from "./keys.ts";
export { bindWeb, port, unknown } from "./port.ts";
export { webAdapter } from "./web.ts";
