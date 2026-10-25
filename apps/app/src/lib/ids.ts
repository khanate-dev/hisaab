import { uuidv7 } from "@hisaab/domain";
import { getRandomBytes } from "expo-crypto";

/** A new client-generated UUIDv7 (ADR-0001). */
export const newId = () => uuidv7(Date.now(), getRandomBytes(10));
