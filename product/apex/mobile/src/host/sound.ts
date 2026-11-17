import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useCallback } from "react";

type Sound = { playing: boolean; at: number; length: number; toggle: () => void };

export function useSound ( url: string ): Sound {

    const player = useAudioPlayer(url);
    const status = useAudioPlayerStatus(player);
    const { playing, currentTime, duration, didJustFinish } = status;
    const toggle = useCallback(() => {

        if ( playing ) player.pause();
        else if ( didJustFinish || currentTime >= duration ) void player.seekTo(0).then(() => player.play());
        else player.play();

    }, [player, playing, didJustFinish, currentTime, duration]);

    return { playing, at: currentTime, length: duration, toggle };

}
