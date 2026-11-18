export type Category = "zero" | "one" | "two" | "few" | "many" | "other";
export type Rule = ( whole: number, split: boolean ) => Category;
export type Numerals = "latn" | "arab";
export type FormatOptions = {
    locale?: string | undefined;
    digits?: number | undefined;
    minDigits?: number | undefined;
    numerals?: Numerals | undefined;
    grouping?: boolean | undefined;
    sign?: "auto" | "always" | "never" | undefined;
    compact?: boolean | undefined;
};
export type CurrencyParts = { amount: string; symbol: string; code: string; negative: boolean; text: string };
export type Amount = number | bigint | string;
export type Style = "decimal" | "percent" | "currency";
export type Told = number | bigint | `${number}`;
export type Unit = { one: string; two: string; few: string; many: string };
