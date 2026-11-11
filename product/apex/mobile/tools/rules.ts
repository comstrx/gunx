import * as tool from "engine/tool";
import { platform } from "../src/types/platform.ts";

export const layers = ["native", "types", "api", "specs", "stores", "hooks", "styles", "elements", "components", "features", "app"] as const;

const frameworks = { web: { framework: ["next"], layers: ["app"] }, mobile: { framework: ["react-native"], layers: ["hooks", "styles", "elements"] }, desktop: { framework: [], layers: [] } } as const;

export function rules ( root: string ): tool.Rules {

    const own = frameworks[platform];

    return {
        root,
        layers: [...layers],
        vendor: ["native"],
        framework: [...own.framework],
        frameworkLayers: [...own.layers],
        outside: ["specs", ".cache"],
        members: tool.members().map(( member ) => member.name),
    };

}
