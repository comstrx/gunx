"use client";

import { Block } from "@/elements/block.tsx";
import { Button } from "@/elements/button.tsx";
import { Image } from "@/elements/image.tsx";
import { Link } from "@/elements/link.tsx";
import { hrefOf, navigate, usePath } from "@/hooks/use-path.ts";
import { usePreferences } from "@/hooks/use-preferences.ts";
import { useMenu } from "@/hooks/use-session.ts";
import { useTheme } from "@/hooks/use-theme.ts";
import { host } from "@/specs/app.ts";

export function Nav ({ path }: { path: string } ) {

    const { locale, toggleLocale } = usePreferences();
    const look = useTheme();
    const at = usePath(path);
    const text = host.app.labels(locale, "nav");
    const items = useMenu(locale, at);
    const logo = host.app.content("logo", locale);

    return (
        <Block as="nav" direction="row" gap="sm" align="center" justify="between" padding="sm" wrap label={text.menu}>
            <Block direction="row" gap="xs" align="center" width="auto" wrap>
                {logo ? <Link href={hrefOf(host.app.home, locale)} onNavigate={navigate}><Image src={logo} alt={host.app.content("name", locale)} ratio="mark" /></Link> : null}
                {items.map(( item ) => <Link key={item.name} href={hrefOf(item.path, locale)} look="button" current={item.active} onNavigate={navigate}>{item.title}</Link>)}
            </Block>
            <Block direction="row" gap="xs" align="center" width="auto">
                <Button look="ghost" size="sm" onPress={look.cycle} label={text.theme}>{text[look.preference] ?? look.preference}</Button>
                <Button look="ghost" size="sm" onPress={toggleLocale} label={text.language}>{text.language}</Button>
            </Block>
        </Block>
    );

}
