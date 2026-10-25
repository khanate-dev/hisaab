// The header name lives with the shared check in packages/domain; builds read both from here.
export { CONTRACT_VERSION_HEADER } from "@hisaab/domain";

/**
 * The contract version this build speaks (ADR-0009). Bump it only for a contract change (a dropped or tightened
 * column or table), never for an ordinary release, and ship the change's upcaster in the same PR.
 */
export const CONTRACT_VERSION = 1;
