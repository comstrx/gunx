"use client";

import { Block } from "@/elements/block.tsx";
import { Button } from "@/elements/button.tsx";
import { Link } from "@/elements/link.tsx";
import { navigate, usePath } from "@/hooks/use-path.ts";
import { usePreferences } from "@/hooks/use-preferences.ts";
import { useMenu } from "@/hooks/use-session.ts";
import { labels } from "@/specs/runtime.ts";
import { useTheme } from "@/styles/theme.ts";

export function Nav ({ path }: { path: string } ) {

    const { locale, toggleLocale } = usePreferences();
    const look = useTheme();
    const at = usePath(path);
    const text = labels(locale, "nav");
    const items = useMenu(locale, at);

    return (
        <Block as="nav" direction="row" gap="sm" align="center" justify="between" padding="sm" wrap label={text.menu}>
            <Block direction="row" gap="xs" align="center" width="auto" wrap>
                {items.map(( item ) => <Link key={item.name} href={item.path} look="button" current={item.active} onNavigate={navigate}>{item.title}</Link>)}
            </Block>
            <Block direction="row" gap="xs" align="center" width="auto">
                <Button look="ghost" size="sm" onPress={look.cycle} label={text.theme}>{text[look.preference] ?? look.preference}</Button>
                <Button look="ghost" size="sm" onPress={toggleLocale} label={text.language}>{text.language}</Button>
            </Block>
        </Block>
    );

}
