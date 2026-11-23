import type { Money } from "@hisaab/domain";

/**
 * A slice's or bar's size for drawing only: gifted-charts takes numbers. Never summed or shown; every figure a person
 * reads stays Money (ADR-0002), in the chart's accessible summary.
 */
export const chartValue = (money: Money) => Math.abs(Number(money.toString()));
