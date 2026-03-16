import { z } from "zod";

// Accept ISO-like strings with or without milliseconds; still requires a valid date
const isIsoDateString = (value) => {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  // basic ISO-8601 shape check (YYYY-MM-DDTHH:MM:SS(.mmm)?Z)
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value);
};

export const MATCH_STATUS = {
  SCHEDULED: "scheduled",
  LIVE: "live",
  FINISHED: "finished",
};

export const listMatchesQuerySchema = z
  .object({
    limit: z.coerce.number().int().positive().max(100).optional(),
  })
  .strict();

export const matchIdParamSchema = z
  .object({
    id: z.coerce.number().int().positive(),
  })
  .strict();

export const createMatchSchema = z
  .object({
    sport: z.string().trim().min(1),
    homeTeam: z.string().trim().min(1),
    awayTeam: z.string().trim().min(1),
    startTime: z
      .string()
      .refine((value) => isIsoDateString(value), "startTime must be a valid ISO date string"),
    endTime: z
      .string()
      .refine((value) => isIsoDateString(value), "endTime must be a valid ISO date string"),
    homeScore: z.coerce.number().int().nonnegative().optional(),
    awayScore: z.coerce.number().int().nonnegative().optional(),
  })
  .superRefine((data, ctx) => {
    const start = new Date(data.startTime);
    const end = new Date(data.endTime);
    if (!(end > start)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "endTime must be after startTime",
        path: ["endTime"],
      });
    }
  });

export const updateScoreSchema = z
  .object({
    homeScore: z.coerce.number().int().nonnegative(),
    awayScore: z.coerce.number().int().nonnegative(),
  })
  .strict();
