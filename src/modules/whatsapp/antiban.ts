// ============================================================
// ANTI-BAN HUMANIZER
// ------------------------------------------------------------
// WhatsApp is increasingly strict with numbers that send "like a bot" (instant,
// no presence, rapid spam). This module makes send patterns more human-like:
//   1. Subscribe to presence with the recipient
//   2. Show "typing"/"recording" status briefly
//   3. Add random delay (scaled by text length) before actually sending
//   4. Set presence to "paused" after sending
//
// Controlled per-session via BotConfig (antiBanEnabled, etc.).
// All best-effort: if anything fails, DO NOT block message sending.
// ============================================================

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

interface AntiBanConfig {
    antiBanEnabled: boolean;
    antiBanTyping: boolean;
    antiBanReadFirst: boolean;
    antiBanMinDelay: number;
    antiBanMaxDelay: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class AntiBanManager {
    private static instance: AntiBanManager;
    private cache: Map<string, { config: AntiBanConfig | null; at: number }> = new Map();

    static getInstance() {
        if (!AntiBanManager.instance) {
            AntiBanManager.instance = new AntiBanManager();
        }
        return AntiBanManager.instance;
    }

    clearCache(sessionId: string) {
        this.cache.delete(sessionId);
    }

    private async getConfig(sessionId: string): Promise<AntiBanConfig | null> {
        const cached = this.cache.get(sessionId);
        if (cached && Date.now() - cached.at < 10000) return cached.config;

        try {
            const session = await prisma.session.findUnique({
                where: { sessionId },
                select: {
                    botConfig: {
                        select: {
                            antiBanEnabled: true,
                            antiBanTyping: true,
                            antiBanReadFirst: true,
                            antiBanMinDelay: true,
                            antiBanMaxDelay: true
                        }
                    }
                }
            });

            const row = session?.botConfig;
            // Default: enabled even if botConfig doesn't exist yet (safe by default)
            const config: AntiBanConfig = row
                ? {
                      antiBanEnabled: row.antiBanEnabled ?? true,
                      antiBanTyping: row.antiBanTyping ?? true,
                      antiBanReadFirst: row.antiBanReadFirst ?? false,
                      antiBanMinDelay: Number(row.antiBanMinDelay) || 600,
                      antiBanMaxDelay: Number(row.antiBanMaxDelay) || 2500
                  }
                : {
                      antiBanEnabled: true,
                      antiBanTyping: true,
                      antiBanReadFirst: false,
                      antiBanMinDelay: 600,
                      antiBanMaxDelay: 2500
                  };

            this.cache.set(sessionId, { config, at: Date.now() });
            return config;
        } catch (e) {
            logger.debug("Anti-Ban", `Config fetch failed for ${sessionId}`, e);
            this.cache.set(sessionId, { config: null, at: Date.now() });
            return null;
        }
    }

    /** Content types that do NOT need humanization (presence/correction). */
    private shouldSkip(content: any): boolean {
        if (!content || typeof content !== "object") return true;
        if (content.react || content.delete || content.edit || content.protocolMessage) return true;
        // presence / status update are not regular message sends
        if (content.disappearingMessagesInChat !== undefined) return true;
        return false;
    }

    private presenceFor(content: any): "composing" | "recording" {
        if (content?.audio && content?.ptt) return "recording";
        return "composing";
    }

    private estimateLength(content: any): number {
        if (!content) return 0;
        if (typeof content.text === "string") return content.text.length;
        if (typeof content.caption === "string") return content.caption.length;
        return 0;
    }

    /**
     * Run humanizer before message is actually sent.
     * @param sock Baileys socket
     * @param sessionId session ID
     * @param jid recipient
     * @param content message payload
     */
    async humanize(sock: any, sessionId: string, jid: string, content: any): Promise<void> {
        try {
            if (!sock || !jid || this.shouldSkip(content)) return;

            const config = await this.getConfig(sessionId);
            if (!config || !config.antiBanEnabled) return;

            const presence = this.presenceFor(content);

            // Mark as read first (optional)
            if (config.antiBanReadFirst) {
                await sock.sendPresenceUpdate("available", jid).catch(() => {});
            }

            if (config.antiBanTyping) {
                await sock.presenceSubscribe?.(jid).catch?.(() => {});
                await sock.sendPresenceUpdate(presence, jid).catch(() => {});
            }

            // Human-like delay: random base + small addition scaled by text length
            const min = Math.max(0, config.antiBanMinDelay);
            const max = Math.max(min, config.antiBanMaxDelay);
            const base = Math.floor(Math.random() * (max - min + 1)) + min;
            const lenBonus = Math.min(2500, this.estimateLength(content) * 25); // ~25ms/char, cap 2.5s
            const delay = base + (config.antiBanTyping ? lenBonus : 0);

            await sleep(delay);

            if (config.antiBanTyping) {
                await sock.sendPresenceUpdate("paused", jid).catch(() => {});
            }
        } catch (e) {
            // best-effort — never fail the message send
            logger.debug("Anti-Ban", "humanize error (ignored):", e);
        }
    }
}

export const antiban = AntiBanManager.getInstance();
