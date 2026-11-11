import type { ReactNode } from "react";
import type { Space } from "@/styles/tokens.ts";

export type BlockProps = {
    children?: ReactNode;
    as?: "div" | "section" | "nav" | "header" | "footer" | "main" | "aside" | undefined;
    direction?: "row" | "column" | undefined;
    gap?: Space | undefined;
    align?: "start" | "center" | "end" | "stretch" | undefined;
    justify?: "start" | "center" | "end" | "between" | undefined;
    padding?: Space | undefined;
    surface?: "plain" | "raised" | undefined;
    width?: "auto" | "full" | "reading" | undefined;
    height?: "auto" | "screen" | undefined;
    wrap?: boolean | undefined;
    id?: string | undefined;
    label?: string | undefined;
    labelledBy?: string | undefined;
    live?: "polite" | "assertive" | undefined;
    busy?: boolean | undefined;
};

export type ButtonProps = {
    children?: ReactNode;
    onPress?: (() => void) | undefined;
    look?: "solid" | "soft" | "ghost" | "danger" | undefined;
    size?: "sm" | "md" | "lg" | undefined;
    width?: "auto" | "full" | undefined;
    pending?: boolean | undefined;
    disabled?: boolean | undefined;
    label?: string | undefined;
    type?: "button" | "submit" | undefined;
};

export type HeadingProps = { children: ReactNode; level?: 1 | 2 | 3 | 4 | undefined; look?: "display" | "title" | "section" | "eyebrow" | undefined; id?: string | undefined };

export type TextProps = {
    children: ReactNode;
    tone?: "default" | "muted" | "danger" | "success" | undefined;
    size?: "sm" | "md" | "lg" | undefined;
    weight?: "regular" | "medium" | "bold" | undefined;
    live?: "polite" | "assertive" | undefined;
};

export type LinkProps = { children: ReactNode; href: string; external?: boolean | undefined; look?: "text" | "button" | "solid" | undefined; current?: boolean | undefined; onNavigate?: (( href: string ) => void) | undefined };

export type DialogProps = { children?: ReactNode; open: boolean; kind?: "plain" | "alert" | undefined; label?: string | undefined; labelledBy?: string | undefined; onDismiss?: (() => void) | undefined };

export type SkeletonProps = { size?: "text" | "title" | "display" | undefined; width?: "third" | "half" | "most" | "full" | undefined };
export type TitleProps = { text: string };
