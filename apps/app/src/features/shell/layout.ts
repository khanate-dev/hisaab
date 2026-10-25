import { useWindowDimensions } from "react-native";

/** Two layouts only, split at Tailwind's `lg` (Navigation ticket, #17): phone below 1024px, sidebar from 1024px. */
export const WIDE_FROM = 1024;

export const useIsWide = () => useWindowDimensions().width >= WIDE_FROM;
