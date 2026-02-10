import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Get 1–2 letter initials from name or email (e.g. "Jean Dupont" → "JD", "jean@mail.com" → "J"). */
export function getInitials(name?: string | null, email?: string): string {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (parts.length >= 2)
      return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
    return parts[0]!.slice(0, 2).toUpperCase()
  }
  if (email?.trim()) return email[0]!.toUpperCase()
  return "?"
}
