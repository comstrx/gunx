import { CameraView } from "expo-camera";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useState } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import type { Lens } from "./lens.ts";

type Framed = { label: string; style: StyleProp<ViewStyle> };

export function LensView ({ lens, label, style }: Framed & { lens: Lens } ) {

    const [look, setLook] = useState(() => lens.look());

    useEffect(() => {

        setLook(lens.look());

        return lens.watch(() => setLook(lens.look()));

    }, [lens]);

    return <CameraView ref={lens.attach} style={style} facing={look.facing} mode={look.mode} mute={look.mute} videoQuality={look.quality} onCameraReady={lens.ready} accessibilityLabel={label} testID="preview" />;

}
export function FilmView ({ url, label, style }: Framed & { url: string } ) {

    const player = useVideoPlayer(url);

    return <VideoView player={player} style={style} contentFit="contain" nativeControls accessibilityLabel={label} testID="player" />;

}
