export {
    type Accuracy, type Adapter, type Battery, type Capability, create, type Device, type Follow, type Full, type Grant, type Haptic, type Hotkey, type Media, type Notice, type Options, type Permission, type Pick, type Picked, type Position, type Shared, type Source, type Stream, targetOf, type Watched,
} from "./device.ts";
export { type Agent, type Contrast, type Hints, type Info, type Insets, type Network, type Orientation, orientationOf, type Platform, type Pointer, parseAgent, type Scheme, unknownInfo } from "./info.ts";
export { type Combo, combo, combos, describe, type Key, matches } from "./keys.ts";
export { bindWeb, port, unknown } from "./port.ts";
export { type Host, webAdapter } from "./web.ts";
