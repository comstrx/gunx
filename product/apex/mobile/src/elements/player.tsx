import * as media from "engine/media";
import { StyleSheet } from "react-native";
import { Button } from "@/elements/button.tsx";
import type { PlayerProps } from "@/elements/contract.ts";
import { useSound } from "@/host/sound.ts";
import { FilmView } from "@/host/views.tsx";
import { radius } from "@/styles/tokens.ts";

type Shown = { url: string; label: string };

const styles = StyleSheet.create({ film: { aspectRatio: 3 / 4, width: "100%", borderRadius: radius.md, overflow: "hidden" } });

function Sound ({ url, label }: Shown ) {

    const sound = useSound(url);
    const shown = `${sound.playing ? "■" : "▶"} ${Math.round(sound.at)} / ${Math.round(sound.length)}s`;

    return <Button look="soft" size="sm" label={label} onPress={sound.toggle}>{shown}</Button>;

}

export function Player ({ file, label }: PlayerProps ) {

    const { url } = media.link(file);

    if ( url === "" ) return null;

    return media.kindOf(file.type) === "audio" ? <Sound url={url} label={label} /> : <FilmView url={url} label={label} style={styles.film} />;

}
