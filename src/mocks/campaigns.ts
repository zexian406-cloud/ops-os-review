import type { Campaign } from "@/domain/types";

export const mockCampaigns: Campaign[] = [
  {
    id: "prime-day-2026",
    name: "Prime Day 2026",
    startDate: "2026-10-08",
    endDate: "2026-10-09",
    multiplier: 3.0,
    active: true,
  },
  {
    id: "black-friday-2026",
    name: "Black Friday",
    startDate: "2026-11-24",
    endDate: "2026-11-28",
    multiplier: 2.5,
    active: true,
  },
  {
    id: "christmas-2026",
    name: "Christmas",
    startDate: "2026-12-15",
    endDate: "2026-12-25",
    multiplier: 2.0,
    active: true,
  },
];