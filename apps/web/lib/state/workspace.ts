import { atom } from "jotai";

export const selectedBuildingIdAtom = atom<string | null>(null);
export const navigationExpandedAtom = atom(true);
