import { NextResponse } from "next/server";
import sharp from "sharp";

import {
  exportPagesAsPng,
  extractDesignId,
  filterPagesForColumn,
  getDesignPages,
  resolveCanvaLink,
} from "@/lib/canva";
import { getSupabaseAdminClient } from "@/lib/supabase";

const bucketName =
  process.env.INSTAGRAM_SECRET_PAGE_BUCKET ?? "instagram-secret-page";
const manifestPath = "manifest.json";
const bucketOptions = {
  public: true,
  allowedMimeTypes: [
    "application/json",
    "application/octet-stream",
    "image/avif",
    "image/gif",
    "image/heic",
    "image/heif",
    "image/jpeg",
    "image/png",
    "image/webp",
  ],
};

type FrameMeta = {
  id: string;
  name: string;
  width: number;
  height: number;
  type: string;
  originalName: string;
  originalType: string;
  segmentIndex: number;
  sourceIndex: number;
};

type InstagramFrame = FrameMeta & {
  path: string;
  url: string;
};

type InstagramGridItem = {
  id: string;
  row: number;
  column: number;
  createdAt: string;
  updatedAt: string;
  sourceNames: string[];
  originalTypes: string[];
  frames: InstagramFrame[];
  sourceType?: "manual" | "canva";
  canvaLink?: string;
};

type InstagramManifest = {
  version: 1;
  updatedAt: string;
  items: InstagramGridItem[];
};

type UploadPayload = {
  id?: string;
  row?: number;
  column?: number;
  frameMetas?: FrameMeta[];
  canvaLink?: string;
  customPages?: {
    kiri?: string;
    tengah?: string;
    kanan?: string;
  };
  splitColumns?: number;
};

function emptyManifest(): InstagramManifest {
  return { version: 1, updatedAt: new Date().toISOString(), items: [] };
}

const getSupabaseAdmin = getSupabaseAdminClient;

async function ensureBucket(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const { data: buckets, error: listError } =
    await supabase.storage.listBuckets();

  if (listError) throw listError;

  const existingBucket = buckets?.find((bucket) => bucket.name === bucketName);

  if (existingBucket) {
    const isMissingJson =
      !existingBucket.allowed_mime_types?.includes("application/json");
    if (!existingBucket.public || isMissingJson) {
      const { error: updateError } = await supabase.storage.updateBucket(
        bucketName,
        bucketOptions,
      );

      if (updateError) throw updateError;
    }
    return;
  }

  const { error: createError } = await supabase.storage.createBucket(
    bucketName,
    bucketOptions,
  );

  if (createError) throw createError;
}

async function readManifest(
  supabase: ReturnType<typeof getSupabaseAdmin>,
): Promise<InstagramManifest> {
  const { data, error } = await supabase.storage
    .from(bucketName)
    .download(manifestPath);

  if (error) return emptyManifest();

  try {
    const parsed = JSON.parse(await data.text()) as InstagramManifest;
    return {
      version: 1,
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
      items: Array.isArray(parsed.items) ? parsed.items : [],
    };
  } catch {
    return emptyManifest();
  }
}

async function writeManifest(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  manifest: InstagramManifest,
) {
  manifest.updatedAt = new Date().toISOString();

  const { error } = await supabase.storage.from(bucketName).upload(
    manifestPath,
    new Blob([JSON.stringify(manifest, null, 2)], {
      type: "application/json",
    }),
    {
      contentType: "application/json",
      upsert: true,
    },
  );

  if (error) throw error;
}

function jsonError(error: unknown, status = 500) {
  return NextResponse.json(
    {
      error: error instanceof Error ? error.message : "Instagram grid failed.",
    },
    { status },
  );
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    await ensureBucket(supabase);
    const manifest = await readManifest(supabase);

    return NextResponse.json(manifest, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const payloadRaw = formData.get("payload");
    const files = formData.getAll("frames").filter((file): file is File => {
      return file instanceof File;
    });

    if (typeof payloadRaw !== "string") {
      return jsonError(new Error("Missing payload."), 400);
    }

    const payload = JSON.parse(payloadRaw) as UploadPayload;
    const canvaLink = payload.canvaLink;
    const sourceType: "manual" | "canva" = canvaLink ? "canva" : "manual";

    const supabase = getSupabaseAdmin();
    await ensureBucket(supabase);
    const manifest = await readManifest(supabase);
    const now = new Date().toISOString();

    if (canvaLink) {
      const fullUrl = await resolveCanvaLink(canvaLink);
      const designId = extractDesignId(fullUrl);
      if (!designId) {
        return jsonError(new Error("Invalid Canva link."), 400);
      }

      const pages = await getDesignPages(designId);

      // Check if it's a single column fetch or row fetch
      const column = Number(payload.column);
      const requestedRow = Number(payload.row);
      const isSingleColumn = column !== undefined && column >= 0 && column <= 2;
      const targetColumns = isSingleColumn ? [column] : [0, 1, 2];
      const totalColumnsCount =
        payload.splitColumns || (isSingleColumn ? 1 : 3);

      console.warn(
        `[API] Canva Fetch started for row ${requestedRow}, columns:`,
        targetColumns,
      );

      for (const targetCol of targetColumns) {
        let customMapping: string | undefined = undefined;
        if (payload.customPages) {
          if (targetCol === 0) customMapping = payload.customPages.kiri;
          if (targetCol === 1) customMapping = payload.customPages.tengah;
          if (targetCol === 2) customMapping = payload.customPages.kanan;
        }

        const targetPageIndices = filterPagesForColumn(
          pages,
          targetCol,
          totalColumnsCount,
          customMapping,
        );
        console.warn(
          `[API] Column ${targetCol} matched ${targetPageIndices.length} Canva pages`,
        );
        if (targetPageIndices.length === 0) continue;

        const imageUrls = await exportPagesAsPng(designId, targetPageIndices);
        console.warn(
          `[API] Exported ${imageUrls.length} PNGs for column ${targetCol}`,
        );
        const colFrames: InstagramFrame[] = [];

        for (const [index, url] of imageUrls.entries()) {
          const res = await fetch(url);
          const arrayBuf = await res.arrayBuffer();
          const buffer = Buffer.from(arrayBuf as ArrayBuffer);

          const metadata = await sharp(buffer).metadata();
          const width = metadata.width || 1080;
          const height = metadata.height || 1080;

          const numSplits = Math.max(1, Math.round(width / 1080));

          for (let splitIdx = 0; splitIdx < numSplits; splitIdx++) {
            const subItemId = crypto.randomUUID();
            const extension = "png";
            const path = `items/${subItemId}/${String(index + 1).padStart(2, "0")}-split-${splitIdx + 1}.${extension}`;

            let uploadBuffer: ArrayBufferView = buffer;
            if (numSplits > 1) {
              const sliceWidth = Math.floor(width / numSplits);
              uploadBuffer = await sharp(buffer)
                .extract({
                  left: splitIdx * sliceWidth,
                  top: 0,
                  width: sliceWidth,
                  height: height,
                })
                .toBuffer();
            }

            const { error: uploadError } = await supabase.storage
              .from(bucketName)
              .upload(path, uploadBuffer, {
                contentType: "image/png",
                upsert: true,
              });

            if (uploadError) throw uploadError;

            const { data } = supabase.storage
              .from(bucketName)
              .getPublicUrl(path);
            colFrames.push({
              id: crypto.randomUUID(),
              name: `canva-page-${index + 1}${numSplits > 1 ? `-part-${splitIdx + 1}` : ""}.png`,
              width: numSplits > 1 ? Math.floor(width / numSplits) : width,
              height: height,
              type: "image/png",
              originalName: `Canva Design ${designId}`,
              originalType: "image/png",
              segmentIndex: colFrames.length,
              sourceIndex: 0,
              path,
              url: `${data.publicUrl}?v=${Date.now()}`,
            });
          }
        }

        // Upsert item for this column
        const colExisting = manifest.items.find(
          (item) => item.row === requestedRow && item.column === targetCol,
        );
        const colItemId = colExisting?.id ?? crypto.randomUUID();

        if (colExisting?.frames.length) {
          await supabase.storage
            .from(bucketName)
            .remove(colExisting.frames.map((f) => f.path));
        }

        const savedItem: InstagramGridItem = {
          id: colItemId,
          row: requestedRow,
          column: targetCol,
          createdAt: colExisting?.createdAt ?? now,
          updatedAt: now,
          sourceNames: [`Canva ${designId}`],
          originalTypes: ["image/png"],
          frames: colFrames,
          sourceType: "canva",
          canvaLink,
        };

        manifest.items = [
          savedItem,
          ...manifest.items.filter((item) => item.id !== colItemId),
        ];
      }

      manifest.items.sort((a, b) => a.row - b.row || a.column - b.column);
      await writeManifest(supabase, manifest);
      return NextResponse.json({ manifest });
    } else {
      const column = Number(payload.column);
      const requestedRow = Number(payload.row);
      const frameMetas = payload.frameMetas ?? [];

      if (![0, 1, 2].includes(column) || !Number.isFinite(requestedRow)) {
        return jsonError(new Error("Invalid grid target."), 400);
      }

      if (files.length === 0 || files.length !== frameMetas.length) {
        return jsonError(new Error("Frame payload mismatch."), 400);
      }

      const frames: InstagramFrame[] = [];
      let sourceNames: string[] = [];
      let originalTypes: string[] = [];

      for (const [index, file] of files.entries()) {
        const meta = frameMetas[index];
        const subItemId = payload.id ?? crypto.randomUUID();
        const extension = file.type === "image/webp" ? "webp" : "original";
        const path = `items/${subItemId}/${String(index + 1).padStart(
          2,
          "0",
        )}-${meta.id}.${extension}`;
        const bytes = new Uint8Array(await file.arrayBuffer());

        const { error: uploadError } = await supabase.storage
          .from(bucketName)
          .upload(path, bytes as unknown as Buffer, {
            contentType: file.type || meta.type || "application/octet-stream",
            upsert: true,
          });

        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from(bucketName).getPublicUrl(path);
        frames.push({
          ...meta,
          path,
          url: `${data.publicUrl}?v=${Date.now()}`,
        });
      }

      sourceNames = Array.from(
        new Set(frames.map((frame) => frame.originalName)),
      );
      originalTypes = Array.from(
        new Set(frames.map((frame) => frame.originalType).filter(Boolean)),
      );

      const existing = payload.id
        ? manifest.items.find((item) => item.id === payload.id)
        : manifest.items.find(
            (item) => item.row === requestedRow && item.column === column,
          );
      const itemId = existing?.id ?? payload.id ?? crypto.randomUUID();
      let row = existing?.row ?? requestedRow;

      if (!existing && requestedRow < 0) {
        manifest.items = manifest.items.map((item) => ({
          ...item,
          row: item.row + 1,
        }));
        row = 0;
      }

      if (existing?.frames.length) {
        await supabase.storage
          .from(bucketName)
          .remove(existing.frames.map((frame) => frame.path));
      }

      const savedItem: InstagramGridItem = {
        id: itemId,
        row,
        column,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        sourceNames,
        originalTypes,
        frames,
        sourceType,
        canvaLink: canvaLink || undefined,
      };

      manifest.items = [
        savedItem,
        ...manifest.items.filter((item) => item.id !== itemId),
      ].sort((a, b) => a.row - b.row || a.column - b.column);

      await writeManifest(supabase, manifest);

      return NextResponse.json({ item: savedItem, manifest });
    }
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as { id?: string; row?: number };

    if (!body.id && body.row === undefined)
      return jsonError(new Error("Missing item id or row."), 400);

    const supabase = getSupabaseAdmin();
    await ensureBucket(supabase);
    const manifest = await readManifest(supabase);

    if (body.row !== undefined) {
      const itemsToDelete = manifest.items.filter(
        (entry) => entry.row === body.row,
      );
      if (itemsToDelete.length === 0) return NextResponse.json({ manifest });

      const framesToRemove = itemsToDelete.flatMap((item) => item.frames);
      if (framesToRemove.length > 0) {
        await supabase.storage
          .from(bucketName)
          .remove(framesToRemove.map((frame) => frame.path));
      }

      manifest.items = manifest.items.filter((entry) => entry.row !== body.row);
      await writeManifest(supabase, manifest);

      return NextResponse.json({ manifest });
    }

    const item = manifest.items.find((entry) => entry.id === body.id);

    if (!item) return NextResponse.json({ manifest });

    if (item.frames.length > 0) {
      await supabase.storage
        .from(bucketName)
        .remove(item.frames.map((frame) => frame.path));
    }

    manifest.items = manifest.items.filter((entry) => entry.id !== body.id);
    await writeManifest(supabase, manifest);

    return NextResponse.json({ manifest });
  } catch (error) {
    return jsonError(error);
  }
}
