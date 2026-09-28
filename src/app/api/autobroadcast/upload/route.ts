import { NextResponse, NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";

export const runtime = "nodejs";

// Upload auto-broadcast media → returned as DATA URI (base64), not a file.
// Stored in DB (mediaUrl column) so it won't be lost during container restarts
// (filesystem is ephemeral on platforms like Railway without volumes).
// When broadcast is sent, the data URI is decoded back into a buffer.
export async function POST(request: NextRequest) {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ status: false, message: "Unauthorized" }, { status: 401 });

    try {
        const formData = await request.formData();
        const file = formData.get("file") as File;

        if (!file) {
            return NextResponse.json({ status: false, message: "No file provided" }, { status: 400 });
        }

        // Validate file type
        const allowedTypes = ["image/jpeg", "image/png", "image/webp", "video/mp4"];
        if (!allowedTypes.includes(file.type)) {
            return NextResponse.json({ status: false, message: "Only JPG, PNG, WebP, and MP4 allowed" }, { status: 400 });
        }

        // Validate file size. Data URIs are stored in DB, so limit smaller (4MB)
        // to avoid overloading the DB/loading. Large videos should use external URLs.
        const MAX = 4 * 1024 * 1024;
        if (file.size > MAX) {
            return NextResponse.json(
                { status: false, message: "File too large (max 4MB for stored media). For large files, use external media URLs." },
                { status: 400 }
            );
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const dataUri = `data:${file.type};base64,${buffer.toString("base64")}`;
        const type = file.type.startsWith("image") ? "image" : "video";

        return NextResponse.json({
            status: true,
            message: "File uploaded",
            // url = data URI (stored in DB). filename is only for display.
            data: { url: dataUri, filename: file.name, type }
        });
    } catch (error) {
        console.error("Upload error:", error);
        return NextResponse.json({ status: false, message: "Upload failed" }, { status: 500 });
    }
}
