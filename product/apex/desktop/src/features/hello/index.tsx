"use client";

import { Greeting } from "@/components/greeting.tsx";
import { useHello } from "@/features/hello/hooks/use-hello.ts";
import type { Placed } from "@/features/index.ts";

export function Hello ({ id }: Placed ) {

    const hello = useHello(id);

    return <Greeting status={hello.status} message={hello.message} onRefresh={hello.refresh} />;

}
