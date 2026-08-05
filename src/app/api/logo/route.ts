import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { requireAdmin } from "@/lib/auth";

const LOGO_DIR = path.join(process.cwd(), "public", "brand");
const META_PATH = path.join(LOGO_DIR, "logo-meta.json");

const ALLOWED_TYPES: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

export async function GET() {
  try {
    const raw = await fs.readFile(META_PATH, "utf8");
    return NextResponse.json(JSON.parse(raw));
  } catch {
    return NextResponse.json({ updatedAt: null, version: 0 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const form = await request.formData();
    const file = form.get("logo");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "לא נבחר קובץ לוגו" }, { status: 400 });
    }

    if (!ALLOWED_TYPES[file.type]) {
      return NextResponse.json(
        { error: "יש להעלות קובץ תמונה (PNG / JPG / WEBP)" },
        { status: 400 },
      );
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "הקובץ גדול מדי (מקסימום 5MB)" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.mkdir(LOGO_DIR, { recursive: true });

    const ext = ALLOWED_TYPES[file.type];
    const filename = `logo${ext}`;
    const target = path.join(LOGO_DIR, filename);

    for (const name of ["logo.png", "logo.jpg", "logo.jpeg", "logo.webp", "logo.gif"]) {
      try {
        await fs.unlink(path.join(LOGO_DIR, name));
      } catch {
        // ignore missing
      }
    }

    await fs.writeFile(target, buffer);

    const meta = {
      updatedAt: new Date().toISOString(),
      version: Date.now(),
      filename,
      src: `/brand/${filename}`,
    };
    await fs.writeFile(META_PATH, JSON.stringify(meta, null, 2), "utf8");

    return NextResponse.json({ ok: true, ...meta });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "העלאת הלוגו נכשלה";
    const status = message.includes("נתן שמחה") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
