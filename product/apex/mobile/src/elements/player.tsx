import * as media from "engine/media";
import { StyleSheet } from "react-native";
import { Button } from "@/elements/button.tsx";
import type { PlayerProps } from "@/elements/contract.ts";
import { useTheme } from "@/hooks/use-theme.ts";
import { useSound } from "@/render/host/sound.ts";
import { FilmView } from "@/render/host/views.tsx";
import { sheeted } from "@/styles/globals.ts";

type Shown = { url: string; label: string };

const stylesOf = sheeted(( radius ) => StyleSheet.create({ film: { aspectRatio: 3 / 4, width: "100%", borderRadius: radius.md, overflow: "hidden" } }));

function Sound ({ url, label }: Shown ) {

    const sound = useSound(url);
    const shown = `${sound.playing ? "■" : "▶"} ${Math.round(sound.at)} / ${Math.round(sound.length)}s`;

    return <Button look="soft" size="sm" label={label} onPress={sound.toggle}>{shown}</Button>;

}

export function Player ({ file, label }: PlayerProps ) {

    const styles = stylesOf(useTheme().radius);
    const { url } = media.link(file);

    if ( url === "" ) return null;

    return media.kindOf(file.type) === "audio" ? <Sound url={url} label={label} /> : <FilmView url={url} label={label} style={styles.film} />;

}
