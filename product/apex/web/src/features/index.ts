import type { ComponentType } from "react";
import { Hello } from "@/features/hello/index.tsx";

export const registry: Readonly<Record<string, ComponentType>> = { hello: Hello };
