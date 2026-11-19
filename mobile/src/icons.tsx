/**
 * Phosphor icons (https://phosphoricons.com), imported one file at a time so the bundle only
 * carries the icons we use. Duotone is the default weight: a solid outline plus a soft fill,
 * which reads as crafted rather than stock line icons.
 */
import type { Icon, IconProps, IconWeight } from "phosphor-react-native";
import * as React from "react";

import { useColors } from "./theme";

/* Per-icon files via require(): Metro bundles only these, and TypeScript uses the package's
   published types instead of type-checking its source. */
const ArrowDownLeftIcon: Icon = require("phosphor-react-native/src/icons/ArrowDownLeft").ArrowDownLeftIcon;
const ArrowUpRightIcon: Icon = require("phosphor-react-native/src/icons/ArrowUpRight").ArrowUpRightIcon;
const BarbellIcon: Icon = require("phosphor-react-native/src/icons/Barbell").BarbellIcon;
const BellIcon: Icon = require("phosphor-react-native/src/icons/Bell").BellIcon;
const BellRingingIcon: Icon = require("phosphor-react-native/src/icons/BellRinging").BellRingingIcon;
const BookOpenTextIcon: Icon = require("phosphor-react-native/src/icons/BookOpenText").BookOpenTextIcon;
const CalendarDotsIcon: Icon = require("phosphor-react-native/src/icons/CalendarDots").CalendarDotsIcon;
const CaretRightIcon: Icon = require("phosphor-react-native/src/icons/CaretRight").CaretRightIcon;
const ChartBarIcon: Icon = require("phosphor-react-native/src/icons/ChartBar").ChartBarIcon;
const CameraIcon: Icon = require("phosphor-react-native/src/icons/Camera").CameraIcon;
const CaretLeftIcon: Icon = require("phosphor-react-native/src/icons/CaretLeft").CaretLeftIcon;
const CircleHalfIcon: Icon = require("phosphor-react-native/src/icons/CircleHalf").CircleHalfIcon;
const DeviceMobileIcon: Icon = require("phosphor-react-native/src/icons/DeviceMobile").DeviceMobileIcon;
const DownloadSimpleIcon: Icon = require("phosphor-react-native/src/icons/DownloadSimple").DownloadSimpleIcon;
const HardDrivesIcon: Icon = require("phosphor-react-native/src/icons/HardDrives").HardDrivesIcon;
const InfoIcon: Icon = require("phosphor-react-native/src/icons/Info").InfoIcon;
const LockKeyIcon: Icon = require("phosphor-react-native/src/icons/LockKey").LockKeyIcon;
const MoonStarsIcon: Icon = require("phosphor-react-native/src/icons/MoonStars").MoonStarsIcon;
const PencilSimpleIcon: Icon = require("phosphor-react-native/src/icons/PencilSimple").PencilSimpleIcon;
const ShieldCheckIcon: Icon = require("phosphor-react-native/src/icons/ShieldCheck").ShieldCheckIcon;
const SignOutIcon: Icon = require("phosphor-react-native/src/icons/SignOut").SignOutIcon;
const SunDimIcon: Icon = require("phosphor-react-native/src/icons/SunDim").SunDimIcon;
const TrashIcon: Icon = require("phosphor-react-native/src/icons/Trash").TrashIcon;
const UserIcon: Icon = require("phosphor-react-native/src/icons/User").UserIcon;
const BellSimpleIcon: Icon = require("phosphor-react-native/src/icons/BellSimple").BellSimpleIcon;
const CheckIcon: Icon = require("phosphor-react-native/src/icons/Check").CheckIcon;
const CheckCircleIcon: Icon = require("phosphor-react-native/src/icons/CheckCircle").CheckCircleIcon;
const CoinsIcon: Icon = require("phosphor-react-native/src/icons/Coins").CoinsIcon;
const SquaresFourIcon: Icon = require("phosphor-react-native/src/icons/SquaresFour").SquaresFourIcon;
const CheckSquareOffsetIcon: Icon = require("phosphor-react-native/src/icons/CheckSquareOffset").CheckSquareOffsetIcon;
const ClockCounterClockwiseIcon: Icon = require("phosphor-react-native/src/icons/ClockCounterClockwise").ClockCounterClockwiseIcon;
const CodeIcon: Icon = require("phosphor-react-native/src/icons/Code").CodeIcon;
const DropIcon: Icon = require("phosphor-react-native/src/icons/Drop").DropIcon;
const FlameIcon: Icon = require("phosphor-react-native/src/icons/Flame").FlameIcon;
const FootprintsIcon: Icon = require("phosphor-react-native/src/icons/Footprints").FootprintsIcon;
const GearSixIcon: Icon = require("phosphor-react-native/src/icons/GearSix").GearSixIcon;
const HeartIcon: Icon = require("phosphor-react-native/src/icons/Heart").HeartIcon;
const HouseSimpleIcon: Icon = require("phosphor-react-native/src/icons/HouseSimple").HouseSimpleIcon;
const LeafIcon: Icon = require("phosphor-react-native/src/icons/Leaf").LeafIcon;
const ListChecksIcon: Icon = require("phosphor-react-native/src/icons/ListChecks").ListChecksIcon;
const MoonIcon: Icon = require("phosphor-react-native/src/icons/Moon").MoonIcon;
const MusicNotesIcon: Icon = require("phosphor-react-native/src/icons/MusicNotes").MusicNotesIcon;
const NotebookIcon: Icon = require("phosphor-react-native/src/icons/Notebook").NotebookIcon;
const NotePencilIcon: Icon = require("phosphor-react-native/src/icons/NotePencil").NotePencilIcon;
const PenNibIcon: Icon = require("phosphor-react-native/src/icons/PenNib").PenNibIcon;
const PlusIcon: Icon = require("phosphor-react-native/src/icons/Plus").PlusIcon;
const ReceiptIcon: Icon = require("phosphor-react-native/src/icons/Receipt").ReceiptIcon;
const SealCheckIcon: Icon = require("phosphor-react-native/src/icons/SealCheck").SealCheckIcon;
const SparkleIcon: Icon = require("phosphor-react-native/src/icons/Sparkle").SparkleIcon;
const SunIcon: Icon = require("phosphor-react-native/src/icons/Sun").SunIcon;
const TargetIcon: Icon = require("phosphor-react-native/src/icons/Target").TargetIcon;
const WalletIcon: Icon = require("phosphor-react-native/src/icons/Wallet").WalletIcon;
const WarningCircleIcon: Icon = require("phosphor-react-native/src/icons/WarningCircle").WarningCircleIcon;


const ICONS = {
  "arrow-in": ArrowDownLeftIcon,
  "arrow-out": ArrowUpRightIcon,
  barbell: BarbellIcon,
  bell: BellIcon,
  "bell-ringing": BellRingingIcon,
  book: BookOpenTextIcon,
  calendar: CalendarDotsIcon,
  "caret-right": CaretRightIcon,
  chart: ChartBarIcon,
  "camera": CameraIcon,
  "caret-left": CaretLeftIcon,
  "circle-half": CircleHalfIcon,
  "device": DeviceMobileIcon,
  "download": DownloadSimpleIcon,
  "server": HardDrivesIcon,
  "info": InfoIcon,
  "lock": LockKeyIcon,
  "moon-stars": MoonStarsIcon,
  "pencil": PencilSimpleIcon,
  "shield": ShieldCheckIcon,
  "sign-out": SignOutIcon,
  "sun-dim": SunDimIcon,
  "trash": TrashIcon,
  "user": UserIcon,
  "bell-simple": BellSimpleIcon,
  check: CheckIcon,
  "check-circle": CheckCircleIcon,
  coins: CoinsIcon,
  squares: SquaresFourIcon,
  "check-square": CheckSquareOffsetIcon,
  history: ClockCounterClockwiseIcon,
  code: CodeIcon,
  drop: DropIcon,
  flame: FlameIcon,
  footprints: FootprintsIcon,
  gear: GearSixIcon,
  heart: HeartIcon,
  home: HouseSimpleIcon,
  leaf: LeafIcon,
  "list-checks": ListChecksIcon,
  moon: MoonIcon,
  music: MusicNotesIcon,
  notebook: NotebookIcon,
  "note-pencil": NotePencilIcon,
  pen: PenNibIcon,
  plus: PlusIcon,
  receipt: ReceiptIcon,
  "seal-check": SealCheckIcon,
  sparkle: SparkleIcon,
  sun: SunIcon,
  target: TargetIcon,
  wallet: WalletIcon,
  warning: WarningCircleIcon,
} as const;

export type GlyphName = keyof typeof ICONS;

export function Glyph({
  name,
  size = 22,
  color,
  weight = "duotone",
  ...rest
}: { name: GlyphName; size?: number; color?: string; weight?: IconWeight } & Omit<IconProps, "size" | "color" | "weight">) {
  const c = useColors();
  const C = ICONS[name];
  return <C size={size} color={color ?? c.foreground} weight={weight} {...rest} />;
}

/** Habit icon keys stored by the API -> Phosphor glyphs. */
const HABIT_GLYPHS: Record<string, GlyphName> = {
  sparkles: "sparkle",
  "book-open": "book",
  dumbbell: "barbell",
  droplet: "drop",
  code: "code",
  moon: "moon",
  sun: "sun",
  heart: "heart",
  leaf: "leaf",
  footprints: "footprints",
  music: "music",
  "pen-line": "pen",
};

export function habitGlyph(key: string): GlyphName {
  return HABIT_GLYPHS[key] ?? "sparkle";
}
