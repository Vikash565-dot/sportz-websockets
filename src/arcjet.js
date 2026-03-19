import arcjet, { shield, detectBot, slidingWindow } from "@arcjet/node";

const arcjetKey = process.env.ARCJET_KEY;
const arcjetMode = process.env.ARCJET_MODE === "DRY_RUN" ? "DRY_RUN" : "LIVE";
const arcjetDisabled =
    process.env.NODE_ENV !== "production" ||
    process.env.ARCJET_DISABLED === "true" ||
    !arcjetKey;

export const httpArcjet = arcjetDisabled
    ? null
    : arcjet({
            key: arcjetKey,
            rules: [
                shield({ mode: arcjetMode }),
                detectBot({
                    mode: arcjetMode,
                    allow: ["CATEGORY:SEARCH_ENGINE", "CATEGORY:PREVIEW"],
                }),
                slidingWindow({ mode: arcjetMode, interval: "10s", max: 5 }),
            ],
        });

export const wsArcjet = httpArcjet;

export function securityMiddleware() {
    return async (req, res, next) => {
        if (!httpArcjet) return next();

        try {
            const decision = await httpArcjet.protect(req);

            if (decision.isDenied()) {
                if (decision.reason.isRateLimit()) {
                    return res.status(429).json({ error: "Too Many Requests" });
                }
                return res.status(403).json({ error: "Forbidden" });
            }
        } catch (e) {
            console.error("Arcjet middleware error", e);
            return res.status(503).json({ error: "Service Unavailable" });
        }
        next();
    };
}