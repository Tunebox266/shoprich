"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Save, CreditCard, Loader2 } from "lucide-react";
import { toast } from "sonner";

// KlikQRIS payment settings card — ONLY rendered for SUPERADMIN.
// API keys are stored on the server (DB) and are never displayed in full.
export function PaymentSettingsCard() {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [keySet, setKeySet] = useState(false);
    const [keyMasked, setKeyMasked] = useState<string | null>(null);
    const [form, setForm] = useState({
        klikqrisBaseUrl: "https://klikqris.com/api",
        klikqrisMerchantId: "",
        klikqrisApiKey: "",
        klikqrisEnabled: false
    });

    const load = () => {
        setLoading(true);
        fetch("/api/settings/payment")
            .then((r) => r.json())
            .then((res) => {
                if (res.status && res.data) {
                    setForm((f) => ({
                        ...f,
                        klikqrisBaseUrl: res.data.klikqrisBaseUrl || "https://klikqris.com/api",
                        klikqrisMerchantId: res.data.klikqrisMerchantId || "",
                        klikqrisEnabled: !!res.data.klikqrisEnabled,
                        klikqrisApiKey: ""
                    }));
                    setKeySet(!!res.data.klikqrisApiKeySet);
                    setKeyMasked(res.data.klikqrisApiKeyMasked || null);
                }
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    };

    useEffect(load, []);

    const save = async () => {
        setSaving(true);
        try {
            const payload: any = {
                klikqrisBaseUrl: form.klikqrisBaseUrl,
                klikqrisMerchantId: form.klikqrisMerchantId,
                klikqrisEnabled: form.klikqrisEnabled
            };
            // only send apiKey if the admin enters a new one
            if (form.klikqrisApiKey.trim() !== "") payload.klikqrisApiKey = form.klikqrisApiKey.trim();

            const res = await fetch("/api/settings/payment", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (res.ok && data.status) {
                toast.success("Payment settings saved");
                setForm((f) => ({ ...f, klikqrisApiKey: "" }));
                load();
            } else {
                toast.error(data.message || "Failed to save");
            }
        } catch {
            toast.error("Failed to save payment settings");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5" /> Payment Gateway (KlikQRIS)
                </CardTitle>
                <CardDescription>
                    SUPERADMIN only. API keys are stored securely on the server and used for all plan upgrade transactions.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                        <Label>Enable payments</Label>
                        <p className="text-xs text-muted-foreground">
                            If disabled, the upgrade plan button will reject checkout.
                        </p>
                    </div>
                    <Switch
                        checked={form.klikqrisEnabled}
                        onCheckedChange={(v) => setForm((f) => ({ ...f, klikqrisEnabled: v }))}
                    />
                </div>

                <div className="space-y-2">
                    <Label>Base URL</Label>
                    <Input
                        value={form.klikqrisBaseUrl}
                        onChange={(e) => setForm((f) => ({ ...f, klikqrisBaseUrl: e.target.value }))}
                        placeholder="https://klikqris.com/api"
                    />
                </div>

                <div className="space-y-2">
                    <Label>Merchant ID (id_merchant)</Label>
                    <Input
                        value={form.klikqrisMerchantId}
                        onChange={(e) => setForm((f) => ({ ...f, klikqrisMerchantId: e.target.value }))}
                        placeholder="YOUR_MERCHANT_ID"
                    />
                </div>

                <div className="space-y-2">
                    <Label>API Key (x-api-key)</Label>
                    <Input
                        type="password"
                        value={form.klikqrisApiKey}
                        onChange={(e) => setForm((f) => ({ ...f, klikqrisApiKey: e.target.value }))}
                        placeholder={keySet ? `Saved (${keyMasked || "••••"}) — enter to replace` : "YOUR_API_KEY"}
                    />
                    <p className="text-xs text-muted-foreground">
                        Leave empty if you do not want to change the saved API key.
                    </p>
                </div>

                <Button onClick={save} disabled={saving || loading} className="w-full">
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save Payment Settings
                </Button>
            </CardContent>
        </Card>
    );
}
