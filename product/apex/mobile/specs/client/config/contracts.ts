export const contracts = {
    realtime: true,
    wire: {
        timeout: 6000,
        retries: { read: 2 },
    },
    live: {
        channel: "{feature}",
        events: { created: "{feature}.created", updated: "{feature}.updated", deleted: "{feature}.deleted" },
    },
} as const;
