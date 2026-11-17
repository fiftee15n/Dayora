import {
  BookOpen,
  Code,
  Droplet,
  Dumbbell,
  Footprints,
  Heart,
  Leaf,
  Moon,
  Music,
  PenLine,
  Sparkles,
  Sun,
  type LucideIcon,
} from "lucide-react";

const MAP: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  "book-open": BookOpen,
  dumbbell: Dumbbell,
  droplet: Droplet,
  code: Code,
  moon: Moon,
  sun: Sun,
  heart: Heart,
  leaf: Leaf,
  footprints: Footprints,
  music: Music,
  "pen-line": PenLine,
};

export const HABIT_ICONS = Object.keys(MAP);

export function HabitIcon({ name, className }: { name: string; className?: string }) {
  const Icon = MAP[name] ?? Sparkles;
  return <Icon className={className} />;
}
