import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** What the OS calls the place deleted files go. */
export const trashName = () =>
  /win/i.test(navigator.platform || navigator.userAgent) ? "Recycle Bin" : "Trash";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
