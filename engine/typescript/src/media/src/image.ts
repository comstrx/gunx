import type { Host, Picked, Sizing } from "./arch.ts";
import { planned } from "./sizing.ts";

export function sizer ( host: Host ): ( file: Picked, sizing: Sizing ) => Promise<Picked> {

    return async ( file, sizing ) => {

        const bitmap = file.blob && host.createImageBitmap && host.OffscreenCanvas ? await host.createImageBitmap(file.blob, { imageOrientation: "from-image" }) : undefined;

        if ( !bitmap || !host.OffscreenCanvas ) return file;

        const { width, height } = bitmap;
        const plan = planned({ width, height, type: file.type, name: file.name }, sizing);
        const from = plan.crop ?? { x: 0, y: 0, width, height };
        const canvas = plan.idle ? undefined : new host.OffscreenCanvas(plan.width, plan.height);
        const brush = canvas?.getContext("2d");

        if ( !canvas || !brush ) {

            bitmap.close?.();

            return { ...file, width, height };

        }

        brush.imageSmoothingQuality = "high";

        if ( plan.format === "jpeg" ) {

            brush.fillStyle = "#fff";
            brush.fillRect(0, 0, plan.width, plan.height);

        }

        brush.drawImage(bitmap, from.x, from.y, from.width, from.height, 0, 0, plan.width, plan.height);
        bitmap.close?.();

        const blob = await canvas.convertToBlob({ type: plan.type, quality: plan.quality });

        return { name: plan.name, type: blob.type || plan.type, size: blob.size, uri: "", blob, width: plan.width, height: plan.height };

    };
}
