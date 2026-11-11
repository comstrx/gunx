import { contents } from "./contents.ts";
import { contracts } from "./contracts.ts";
import { features } from "./features.ts";
import { settings } from "./settings.ts";
import { themes } from "./themes.ts";

export const config = { contents, contracts, features, settings, themes } as const;
