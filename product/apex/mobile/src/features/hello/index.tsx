"use client";

import { Greeting } from "@/components/greeting.tsx";
import { useHello } from "@/features/hello/hooks/use-hello.ts";

export function Hello () {

    const hello = useHello();

    return <Greeting status={hello.status} message={hello.message} onRefresh={hello.refresh} />;

}
