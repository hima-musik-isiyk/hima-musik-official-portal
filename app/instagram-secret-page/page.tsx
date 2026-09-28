"use client";

import { unzipSync, zipSync } from "fflate";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  IconChevronLeft,
  IconChevronRight,
  IconFileDown,
  IconLayers,
  IconLoader,
  IconMinus,
  IconPackage,
  IconPlus,
  IconRefreshCw,
  IconTrash,
  IconX,
  IconZap,
} from "@/components/Icons";

function useCarouselScroll(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  frameCount: number,
) {
  const animId = useRef(0);
  const [visualIndex, setVisualIndex] = useState(0);

  const scrollToX = useCallback(
    (target: number, duration = 150) => {
      const el = scrollRef.current;
      if (!el) return;
      cancelAnimationFrame(animId.current);
      const start = el.scrollLeft;
      const delta = target - start;
      if (Math.abs(delta) < 1) {
        el.scrollLeft = target;
        return;
      }
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = Math.min((now - t0) / duration, 1);
        el.scrollLeft = start + delta * (1 - (1 - p) ** 3);
        if (p < 1) animId.current = requestAnimationFrame(tick);
      };
      animId.current = requestAnimationFrame(tick);
    },
    [scrollRef],
  );

  // Real-time visual index from scroll position
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const w = el.offsetWidth;
      if (!w) return;
      setVisualIndex(
        Math.max(0, Math.min(frameCount - 1, Math.round(el.scrollLeft / w))),
      );
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollRef, frameCount]);

  // Touch: disable CSS snap while finger is down, fast JS snap on release
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || frameCount <= 1) return;
    const onStart = () => {
      cancelAnimationFrame(animId.current);
      el.style.scrollSnapType = "none";
    };
    const onEnd = () => {
      const w = el.offsetWidth;
      if (!w) return;
      const idx = Math.max(
        0,
        Math.min(frameCount - 1, Math.round(el.scrollLeft / w)),
      );
      scrollToX(idx * w);
      setTimeout(() => {
        el.style.scrollSnapType = "x mandatory";
      }, 180);
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [scrollRef, frameCount, scrollToX]);

  useEffect(() => () => cancelAnimationFrame(animId.current), []);

  return {
    visualIndex,
    scrollToX,
    cancelAnim: () => cancelAnimationFrame(animId.current),
  };
}

const canvasWidth = 1080;
const canvasHeight = 1440;
const targetAspect = canvasWidth / canvasHeight;
const apiPath = "/api/instagram-secret-page";
async function adminFetch(init: RequestInit = {}): Promise<Response> {
  return fetch(apiPath, { cache: "no-store", ...init });
}

type InstagramFrame = {
  id: string;
  name: string;
  width: number;
  height: number;
  type: string;
  originalName: string;
  originalType: string;
  segmentIndex: number;
  sourceIndex: number;
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

type ProcessedFrame = {
  file: File;
  meta: Omit<InstagramFrame, "path" | "url">;
};

type GridTarget = {
  row: number;
  column: number;
  itemId?: string;
};

type PreviewState = {
  itemId: string;
  frameIndex: number;
};

const naturalCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

function normalizeManifest(
  data: Partial<InstagramManifest>,
): InstagramManifest {
  return {
    version: 1,
    updatedAt: data.updatedAt ?? "2026-06-25T00:00:00.000Z",
    items: Array.isArray(data.items) ? data.items : [],
  };
}

function getMimeFromName(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".avif")) return "image/avif";
  return "image/jpeg";
}

function isImageName(name: string) {
  return /\.(avif|gif|jpe?g|png|webp)$/i.test(name);
}

function isZip(file: File) {
  return file.type === "application/zip" || /\.zip$/i.test(file.name);
}

function fileStem(name: string) {
  return name.replace(/\.[^.]+$/, "");
}

function getRows(items: InstagramGridItem[]) {
  if (!items.length) return [0];

  const existingRows = Array.from(new Set(items.map((item) => item.row))).sort(
    (a, b) => a - b,
  );

  const minRow = existingRows[0];
  const maxRow = existingRows[existingRows.length - 1];

  return [minRow - 1, ...existingRows, maxRow + 1];
}

async function loadBitmap(file: File) {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file);
    } catch {
      // Fall back to HTMLImageElement decoding below.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });

    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function canvasToWebp(canvas: HTMLCanvasElement) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/webp", 0.92);
  });
}

async function extractInputImages(files: File[]) {
  const extracted: File[] = [];

  for (const file of files) {
    if (!isZip(file)) {
      if (file.type.startsWith("image/") || isImageName(file.name)) {
        extracted.push(file);
      }
      continue;
    }

    const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), {
      filter: (entry) => !entry.name.endsWith("/") && isImageName(entry.name),
    });

    Object.entries(entries)
      .sort(([a], [b]) => naturalCollator.compare(a, b))
      .forEach(([name, bytes]) => {
        const cleanName = name.split("/").filter(Boolean).pop() ?? name;
        const safeBytes = Uint8Array.from(bytes);
        extracted.push(
          new File([safeBytes], cleanName, {
            type: getMimeFromName(cleanName),
          }),
        );
      });
  }

  return extracted.sort((a, b) => naturalCollator.compare(a.name, b.name));
}

async function processImageFile(file: File, sourceIndex: number) {
  const bitmap = await loadBitmap(file);
  const width = bitmap.width;
  const height = bitmap.height;
  const segmentCount = Math.max(1, Math.round(width / (height * targetAspect)));
  const segmentWidth = width / segmentCount;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  if (!context) throw new Error("Canvas not available.");

  const frames: ProcessedFrame[] = [];

  for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
    let sx = segmentIndex * segmentWidth;
    let sy = 0;
    let sw = segmentWidth;
    let sh = height;
    const sourceAspect = sw / sh;

    if (sourceAspect > targetAspect) {
      const croppedWidth = sh * targetAspect;
      sx += (sw - croppedWidth) / 2;
      sw = croppedWidth;
    } else if (sourceAspect < targetAspect) {
      const croppedHeight = sw / targetAspect;
      sy += (sh - croppedHeight) / 2;
      sh = croppedHeight;
    }

    context.clearRect(0, 0, canvasWidth, canvasHeight);
    context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvasWidth, canvasHeight);

    const webp = await canvasToWebp(canvas);

    if (!webp) {
      return [
        {
          file,
          meta: {
            id: crypto.randomUUID(),
            name: file.name,
            width,
            height,
            type: file.type || getMimeFromName(file.name),
            originalName: file.name,
            originalType: file.type || getMimeFromName(file.name),
            segmentIndex: 0,
            sourceIndex,
          },
        },
      ];
    }

    const outputName =
      segmentCount > 1
        ? `${fileStem(file.name)}-${String(segmentIndex + 1).padStart(
            2,
            "0",
          )}.webp`
        : `${fileStem(file.name)}.webp`;

    frames.push({
      file: new File([webp], outputName, { type: "image/webp" }),
      meta: {
        id: crypto.randomUUID(),
        name: outputName,
        width: canvasWidth,
        height: canvasHeight,
        type: "image/webp",
        originalName: file.name,
        originalType: file.type || getMimeFromName(file.name),
        segmentIndex,
        sourceIndex,
      },
    });
  }

  if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();
  return frames;
}

async function processFiles(files: File[]) {
  const images = await extractInputImages(files);
  const processed: ProcessedFrame[] = [];

  for (const [sourceIndex, image] of images.entries()) {
    const frames = await processImageFile(image, sourceIndex);
    processed.push(...frames);
  }

  return processed;
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function downloadItem(item: InstagramGridItem) {
  const bytes: Record<string, Uint8Array> = {};

  for (const [index, frame] of item.frames.entries()) {
    const response = await fetch(frame.url);
    const data = new Uint8Array(await response.arrayBuffer());
    const name = `${String(index + 1).padStart(2, "0")}-${frame.name}`;

    if (item.frames.length === 1) {
      saveBlob(new Blob([data], { type: frame.type }), name);
      return;
    }

    bytes[name] = data;
  }

  const zipped = zipSync(bytes, { level: 0 });
  const safeZip = Uint8Array.from(zipped);
  saveBlob(
    new Blob([safeZip], { type: "application/zip" }),
    `instagram-cell-${item.row + 1}-${item.column + 1}.zip`,
  );
}

export default function InstagramSecretPage() {
  const [manifest, setManifest] = useState<InstagramManifest>(() =>
    normalizeManifest({ items: [] }),
  );
  const [activeFrame, setActiveFrame] = useState<Record<string, number>>({});
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [target, setTarget] = useState<GridTarget | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [loadingCells, setLoadingCells] = useState<Set<string>>(new Set());

  const itemMap = useMemo(() => {
    const map = new Map<string, InstagramGridItem>();
    manifest.items.forEach((item) => {
      map.set(`${item.row}:${item.column}`, item);
    });
    return map;
  }, [manifest.items]);

  const rows = useMemo(() => getRows(manifest.items), [manifest.items]);
  const currentPreviewItem = useMemo(
    () =>
      preview
        ? (manifest.items.find((item) => item.id === preview.itemId) ?? null)
        : null,
    [manifest.items, preview],
  );
  const frameCount = manifest.items.reduce(
    (total, item) => total + item.frames.length,
    0,
  );

  const loadManifest = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const response = await adminFetch();
      const data = await response.json();

      if (!response.ok) throw new Error(data.error ?? "Load failed.");
      setManifest(normalizeManifest(data));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Load failed.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadManifest();
  }, [loadManifest]);

  useEffect(() => {
    if (!preview) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previous;
    };
  }, [preview]);

  const openImporter = useCallback((nextTarget: GridTarget) => {
    setTarget(nextTarget);
    document.getElementById("instagram-secret-file-input")?.click();
  }, []);

  async function handleCanvaLink(
    url: string,
    manualTarget?: GridTarget,
    customPages?: { kiri?: string; tengah?: string; kanan?: string },
  ) {
    const activeTarget = manualTarget || target;
    if (!url || !activeTarget) return;

    setError("");

    if (activeTarget.column === -1) {
      const row = activeTarget.row;
      const columnsToFetch = [0, 1, 2];

      setLoadingCells(
        (prev) => new Set([...prev, `${row}:0`, `${row}:1`, `${row}:2`]),
      );

      for (const col of columnsToFetch) {
        try {
          const payload: Record<string, unknown> = {
            id: undefined,
            row,
            column: col,
            canvaLink: url,
            customPages,
            splitColumns: 3,
          };

          const formData = new FormData();
          formData.set("payload", JSON.stringify(payload));

          const response = await adminFetch({
            method: "POST",
            body: formData,
          });
          const data = await response.json();

          if (!response.ok)
            throw new Error(data.error ?? "Canva fetch failed.");
          setManifest(normalizeManifest(data.manifest));
          if (data.item?.id)
            setActiveFrame((state) => ({ ...state, [data.item.id]: 0 }));
        } catch (e) {
          setError(e instanceof Error ? e.message : "Canva fetch failed.");
        } finally {
          setLoadingCells((prev) => {
            const next = new Set(prev);
            next.delete(`${row}:${col}`);
            return next;
          });
        }
      }
      setTarget(null);
      return;
    }

    setBusy("Fetching Canva");
    try {
      const payload: Record<string, unknown> = {
        id: activeTarget.itemId,
        row: activeTarget.row,
        column: activeTarget.column,
        canvaLink: url,
      };
      if (customPages) payload.customPages = customPages;

      const formData = new FormData();
      formData.set("payload", JSON.stringify(payload));

      const response = await adminFetch({
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error ?? "Canva fetch failed.");
      setManifest(normalizeManifest(data.manifest));
      if (data.item?.id)
        setActiveFrame((state) => ({ ...state, [data.item.id]: 0 }));
    } catch (canvaError) {
      setError(
        canvaError instanceof Error
          ? canvaError.message
          : "Canva fetch failed.",
      );
    } finally {
      setBusy("");
      setTarget(null);
    }
  }

  const handleUpload = useCallback(
    async (files: FileList | null) => {
      if (!files || !target) return;

      setBusy("Processing");
      setError("");

      try {
        const frames = await processFiles(Array.from(files));

        if (frames.length === 0) throw new Error("No image found.");

        setBusy(`Uploading ${frames.length}`);
        const formData = new FormData();
        formData.set(
          "payload",
          JSON.stringify({
            id: target.itemId,
            row: target.row,
            column: target.column,
            frameMetas: frames.map((frame) => frame.meta),
          }),
        );
        frames.forEach((frame) => formData.append("frames", frame.file));

        const response = await adminFetch({
          method: "POST",
          body: formData,
        });
        const data = await response.json();

        if (!response.ok) throw new Error(data.error ?? "Upload failed.");
        setManifest(normalizeManifest(data.manifest));
        if (data.item?.id)
          setActiveFrame((state) => ({ ...state, [data.item.id]: 0 }));
      } catch (uploadError) {
        setError(
          uploadError instanceof Error ? uploadError.message : "Upload failed.",
        );
      } finally {
        setBusy("");
        setTarget(null);
        const fileInput = document.getElementById(
          "instagram-secret-file-input",
        ) as HTMLInputElement | null;
        if (fileInput) fileInput.value = "";
      }
    },
    [target],
  );

  async function handleDelete(item: InstagramGridItem) {
    if (!window.confirm("Are you sure you want to delete this cell?")) return;
    setBusy("Deleting");
    setError("");

    try {
      const response = await adminFetch({
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: item.id }),
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error ?? "Delete failed.");
      setManifest(normalizeManifest(data.manifest));
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : "Delete failed.",
      );
    } finally {
      setBusy("");
    }
  }

  async function handleDeleteRow(row: number) {
    if (!window.confirm("Are you sure you want to delete this entire row?"))
      return;
    setBusy("Deleting row");
    setError("");

    try {
      const response = await adminFetch({
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ row }),
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error ?? "Delete row failed.");
      setManifest(normalizeManifest(data.manifest));
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Delete row failed.",
      );
    } finally {
      setBusy("");
    }
  }

  function openPreview(item: InstagramGridItem) {
    setPreview({
      itemId: item.id,
      frameIndex: Math.min(activeFrame[item.id] ?? 0, item.frames.length - 1),
    });
  }

  function closePreview() {
    setPreview(null);
  }

  function movePreviewFrame(direction: -1 | 1) {
    setPreview((state) => {
      if (!state) return state;

      const item = manifest.items.find((entry) => entry.id === state.itemId);
      if (!item || item.frames.length <= 1) return state;

      const next = Math.max(
        0,
        Math.min(item.frames.length - 1, state.frameIndex + direction),
      );

      if (next === state.frameIndex) return state;

      setActiveFrame((frames) => ({ ...frames, [state.itemId]: next }));
      return { ...state, frameIndex: next };
    });
  }

  return (
    <section className="min-h-screen bg-[#050505] px-4 pt-8 pb-14 text-neutral-50 sm:px-6 lg:px-8">
      <input
        id="instagram-secret-file-input"
        className="hidden"
        type="file"
        accept="image/*,.zip,application/zip"
        multiple
        onChange={(event) => void handleUpload(event.target.files)}
      />

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-7">
        <header className="flex flex-col gap-5 border-b border-white/10 pb-6 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-[0.24em] text-neutral-500 uppercase">
              Instagram Secret Page
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal text-balance text-white sm:text-4xl">
              3-column post preview
            </h1>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-xs text-neutral-400 sm:min-w-80">
            <div className="border border-white/10 bg-white/3 p-3">
              <strong className="block text-lg text-white">
                {manifest.items.length}
              </strong>
              cells
            </div>
            <div className="border border-white/10 bg-white/3 p-3">
              <strong className="block text-lg text-white">{frameCount}</strong>
              frames
            </div>
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 border border-white/10 bg-white/3 p-3 text-neutral-300 transition hover:border-white/30 hover:bg-white/7"
              onClick={() => void loadManifest()}
            >
              {isLoading ? (
                <IconLoader className="size-4 animate-spin" />
              ) : (
                <IconRefreshCw className="size-4" />
              )}
              sync
            </button>
          </div>
        </header>

        {(busy || error) && (
          <div
            className={`flex items-center justify-between gap-3 border px-4 py-3 text-sm transition-all duration-300 ${
              error
                ? "border-red-500/50 bg-red-500/10 text-red-200"
                : "border-blue-500/50 bg-blue-500/10 text-blue-200"
            }`}
          >
            <div className="flex items-center gap-2">
              {busy && <IconLoader className="size-4 animate-spin" />}
              <span>{error || busy}</span>
            </div>
            {error && (
              <button
                onClick={() => setError("")}
                className="text-neutral-500 hover:text-white"
              >
                <IconX className="size-4" />
              </button>
            )}
          </div>
        )}

        <div className="mx-auto w-full" style={{ maxWidth: "935px" }}>
          <div className="grid grid-cols-3 gap-px bg-black shadow-2xl">
            {isLoading
              ? Array.from({ length: 12 }).map((_, i) => (
                  <div
                    key={i}
                    className="aspect-1080/1440 w-full animate-pulse bg-neutral-900"
                  />
                ))
              : rows.flatMap((row) => {
                  const hasRowItem = [0, 1, 2].some((col) =>
                    itemMap.has(`${row}:${col}`),
                  );

                  return [0, 1, 2].map((column) => {
                    const item = itemMap.get(`${row}:${column}`);
                    const isCellLoading = loadingCells.has(`${row}:${column}`);

                    return (
                      <div key={`${row}:${column}`} className="relative">
                        {isCellLoading && (
                          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                            <div className="flex flex-col items-center gap-2 text-blue-400">
                              <IconLoader className="size-6 animate-spin" />
                              <span className="text-[10px] font-bold tracking-widest text-white uppercase">
                                Fetching
                              </span>
                            </div>
                          </div>
                        )}

                        {item ? (
                          <PostCell
                            item={item}
                            activeIndex={activeFrame[item.id] ?? 0}
                            onOpenPreview={() => openPreview(item)}
                            onEdit={() =>
                              openImporter({
                                row: item.row,
                                column: item.column,
                                itemId: item.id,
                              })
                            }
                            onAddCarousel={() =>
                              openImporter({
                                row: item.row,
                                column: item.column,
                                itemId: item.id,
                              })
                            }
                            onDelete={() => void handleDelete(item)}
                            onDownload={() => void downloadItem(item)}
                            onIndexChange={(index) =>
                              setActiveFrame((state) => ({
                                ...state,
                                [item.id]: index,
                              }))
                            }
                          />
                        ) : (
                          <PlaceholderCell
                            row={row}
                            column={column}
                            disabled={Boolean(busy)}
                            onUpload={() => openImporter({ row, column })}
                          />
                        )}

                        {/* Row-level Canva button (only on first column of empty rows) */}
                        {column === 2 && !hasRowItem && (
                          <div className="absolute top-1/2 right-2 z-50 -translate-y-1/2 md:right-auto md:left-full md:ml-4">
                            <RowCanvaButton
                              busy={Boolean(busy)}
                              onFetch={(url, customPages) => {
                                const t = { row, column: -1 };
                                setTarget(t);
                                void handleCanvaLink(url, t, customPages);
                              }}
                            />
                          </div>
                        )}

                        {/* Delete Row button (on last column of non-empty rows) */}
                        {column === 2 && hasRowItem && (
                          <div className="absolute top-1/2 right-2 z-50 -translate-y-1/2 md:right-auto md:left-full md:ml-4">
                            <button
                              type="button"
                              disabled={Boolean(busy)}
                              onClick={() => void handleDeleteRow(row)}
                              className="flex size-11 flex-col items-center justify-center rounded-full border border-red-500/30 bg-red-500/10 text-red-400 shadow-lg shadow-red-500/10 backdrop-blur transition hover:scale-110 hover:bg-red-500 hover:text-white disabled:cursor-wait disabled:opacity-50"
                            >
                              {busy ? (
                                <IconLoader className="size-4 animate-spin" />
                              ) : (
                                <IconTrash className="size-4 fill-current" />
                              )}
                              <span className="text-[7px] font-bold uppercase">
                                Row
                              </span>
                            </button>
                          </div>
                        )}

                        {/* Row Source Indicator */}
                        {column === 0 && hasRowItem && (
                          <div className="absolute top-1/2 left-2 z-40 -translate-y-1/2 md:right-full md:left-auto md:mr-4">
                            {(() => {
                              const isCanva = [0, 1, 2].some(
                                (c) =>
                                  itemMap.get(`${row}:${c}`)?.sourceType ===
                                  "canva",
                              );
                              const tagContent = (
                                <div
                                  className={`flex items-center justify-center gap-1.5 rounded-lg border border-white/10 px-1.5 py-2 text-[9px] font-bold tracking-widest whitespace-nowrap uppercase shadow-xl backdrop-blur-md transition-all ${isCanva ? "cursor-pointer bg-neutral-900/90 text-blue-400 hover:scale-105 hover:bg-neutral-800 hover:shadow-blue-500/20" : "bg-neutral-900/90 text-neutral-400"}`}
                                  style={{
                                    writingMode: "vertical-rl",
                                    transform: "rotate(180deg)",
                                  }}
                                >
                                  {isCanva ? (
                                    <>
                                      <IconZap className="size-3 rotate-90 fill-current" />{" "}
                                      Canva Tap
                                    </>
                                  ) : (
                                    <>
                                      <IconLayers className="size-3 rotate-90" />{" "}
                                      Manual
                                    </>
                                  )}
                                </div>
                              );

                              if (isCanva) {
                                const canvaLink =
                                  [0, 1, 2]
                                    .map(
                                      (c) =>
                                        itemMap.get(`${row}:${c}`)?.canvaLink,
                                    )
                                    .find(Boolean) || "";
                                return (
                                  <RowCanvaButton
                                    busy={Boolean(busy)}
                                    defaultUrl={canvaLink}
                                    trigger={tagContent}
                                    onFetch={(url, customPages) => {
                                      const t = { row, column: -1 };
                                      setTarget(t);
                                      void handleCanvaLink(url, t, customPages);
                                    }}
                                  />
                                );
                              }

                              return tagContent;
                            })()}
                          </div>
                        )}
                      </div>
                    );
                  });
                })}
          </div>
        </div>
      </div>

      {preview && currentPreviewItem && (
        <PreviewModal
          item={currentPreviewItem}
          activeIndex={Math.min(
            preview.frameIndex,
            currentPreviewItem.frames.length - 1,
          )}
          onClose={closePreview}
          onPrev={() => movePreviewFrame(-1)}
          onNext={() => movePreviewFrame(1)}
          onEdit={() => {
            closePreview();
            openImporter({
              row: currentPreviewItem.row,
              column: currentPreviewItem.column,
              itemId: currentPreviewItem.id,
            });
          }}
          onAddCarousel={() => {
            closePreview();
            openImporter({
              row: currentPreviewItem.row,
              column: currentPreviewItem.column,
              itemId: currentPreviewItem.id,
            });
          }}
          onDelete={() => {
            void handleDelete(currentPreviewItem);
            closePreview();
          }}
          onDownload={() => void downloadItem(currentPreviewItem)}
        />
      )}
    </section>
  );
}

function QuickTooltip({
  text,
  children,
}: {
  text: string;
  children: React.ReactNode;
}) {
  return (
    <div className="group/tooltip relative inline-block">
      {children}
      <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded bg-neutral-900 px-2 py-1 text-xs whitespace-nowrap text-white opacity-0 shadow-md transition-opacity duration-100 group-hover/tooltip:opacity-100">
        {text}
      </div>
    </div>
  );
}

function PlaceholderCell({
  row,
  column,
  disabled,
  onUpload,
}: {
  row: number;
  column: number;
  disabled: boolean;
  onUpload: () => void;
}) {
  return (
    <div className="group relative aspect-3/4 overflow-hidden bg-[#121212] transition hover:bg-[#1a1a1a]">
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={onUpload}
            className="grid size-12 place-items-center rounded-full border border-white/15 bg-black/35 text-neutral-400 transition hover:border-white/35 hover:text-white disabled:cursor-wait disabled:opacity-60"
          >
            <IconPlus className="size-6" />
          </button>
          <span className="text-[11px] font-medium tracking-[0.08em] text-neutral-500 uppercase">
            Import
          </span>
        </div>

        <span className="absolute bottom-3 text-[10px] text-neutral-700">
          {row + 1}:{column + 1}
        </span>
      </div>
    </div>
  );
}

function RowCanvaButton({
  busy,
  onFetch,
  trigger,
  defaultUrl,
}: {
  busy: boolean;
  onFetch: (
    url: string,
    customPages?: { kiri: string; tengah: string; kanan: string },
  ) => void;
  trigger?: React.ReactNode;
  defaultUrl?: string;
}) {
  const [isLinking, setIsLinking] = useState(false);
  const [url, setUrl] = useState(defaultUrl || "");
  const [pages, setPages] = useState({ kiri: "1", tengah: "2", kanan: "3" });
  const [mounted, setMounted] = useState(false);

  const updatePage = (key: keyof typeof pages, idx: number, delta: number) => {
    setPages((prev) => {
      const parts = prev[key]
        .split(/[,\s]+/)
        .filter(Boolean)
        .map(Number);
      if (parts[idx] !== undefined) {
        parts[idx] = Math.max(1, parts[idx] + delta);
      }
      return { ...prev, [key]: parts.join(", ") };
    });
  };

  const removePage = (key: keyof typeof pages, idx: number) => {
    setPages((prev) => {
      const parts = prev[key].split(/[,\s]+/).filter(Boolean);
      const newParts = parts.filter((_, i) => i !== idx);
      return { ...prev, [key]: newParts.join(", ") };
    });
  };

  const addPage = (key: keyof typeof pages) => {
    setPages((prev) => {
      const parts = prev[key].split(/[,\s]+/).filter(Boolean);
      const lastVal =
        parts.length > 0 ? parseInt(parts[parts.length - 1]) || 0 : 0;
      const nextVal = lastVal + 1;
      const newVal =
        parts.length > 0 ? `${prev[key]}, ${nextVal}` : String(nextVal);
      return { ...prev, [key]: newVal };
    });
  };

  useEffect(() => {
    setMounted(true);
    if (defaultUrl) setUrl(defaultUrl);
  }, [defaultUrl]);

  useEffect(() => {
    if (!isLinking) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsLinking(false);
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isLinking]);

  return (
    <>
      {trigger ? (
        <div onClick={() => setIsLinking(true)}>{trigger}</div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => setIsLinking(true)}
          className="flex size-11 flex-col items-center justify-center rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-400 shadow-lg shadow-blue-500/10 backdrop-blur transition hover:scale-110 hover:bg-blue-500 hover:text-white disabled:cursor-wait disabled:opacity-50"
        >
          {busy ? (
            <IconLoader className="size-4 animate-spin" />
          ) : (
            <IconZap className="size-4 fill-current" />
          )}
          <span className="text-[7px] font-bold uppercase">Row</span>
        </button>
      )}

      {mounted &&
        isLinking &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
            onClick={() => setIsLinking(false)}
          >
            <div
              className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-white/10 bg-neutral-900/95 p-5 shadow-2xl backdrop-blur-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">
                  Import Row via Canva
                </h3>
                <button
                  onClick={() => setIsLinking(false)}
                  className="text-neutral-400 transition hover:text-white"
                >
                  <IconX className="size-5" />
                </button>
              </div>

              <div className="mt-2 flex flex-col gap-1.5">
                <label className="text-[10px] font-semibold tracking-wider text-neutral-500 uppercase">
                  Canva Link
                </label>
                <input
                  autoFocus
                  placeholder="Paste link..."
                  className="w-full rounded border border-white/10 bg-black/50 px-3 py-2 text-xs text-white transition outline-none placeholder:text-neutral-600 focus:border-white/30"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-semibold tracking-wider text-neutral-500 uppercase">
                    Target Pages
                  </label>
                  <span className="text-[9px] text-neutral-600">
                    Use commas for multiple (1, 5, 7)
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(["kiri", "tengah", "kanan"] as const).map((key) => {
                    const parts = pages[key]
                      .split(/[,\s]+/)
                      .filter(Boolean)
                      .map(Number);
                    return (
                      <div key={key} className="flex flex-col gap-2">
                        <label className="text-center text-[9px] font-black tracking-[0.2em] text-neutral-500 uppercase">
                          {key === "kiri"
                            ? "Left"
                            : key === "tengah"
                              ? "Center"
                              : "Right"}
                        </label>

                        <div className="flex min-h-30 flex-col gap-2 rounded-xl border border-white/5 bg-black/30 p-1.5">
                          <div className="flex flex-1 flex-col gap-1.5">
                            {parts.length === 0 && (
                              <div className="flex flex-1 items-center justify-center px-1 text-center">
                                <span className="text-[9px] leading-tight text-neutral-700 italic">
                                  No pages
                                </span>
                              </div>
                            )}
                            {parts.map((p, i) => (
                              <div
                                key={i}
                                className="flex flex-col items-center gap-0.5 rounded-lg border border-white/10 bg-white/5 p-1 transition hover:bg-white/10"
                              >
                                <div className="flex w-full items-center justify-between">
                                  <button
                                    type="button"
                                    onClick={() => updatePage(key, i, -1)}
                                    className="flex size-6 items-center justify-center rounded text-neutral-500 transition hover:bg-white/10 hover:text-white"
                                  >
                                    <IconMinus className="size-3" />
                                  </button>
                                  <span className="text-[11px] font-bold text-white">
                                    {p}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => updatePage(key, i, 1)}
                                    className="flex size-6 items-center justify-center rounded text-neutral-500 transition hover:bg-white/10 hover:text-white"
                                  >
                                    <IconPlus className="size-3" />
                                  </button>
                                </div>
                                <div className="my-0.5 h-px w-full bg-white/5" />
                                <button
                                  type="button"
                                  onClick={() => removePage(key, i)}
                                  className="flex h-5 w-full items-center justify-center rounded text-neutral-600 transition hover:bg-red-500/20 hover:text-red-400"
                                >
                                  <IconX className="size-3" />
                                </button>
                              </div>
                            ))}
                          </div>

                          <button
                            type="button"
                            onClick={() => addPage(key)}
                            className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-white/10 py-2 text-[9px] font-bold text-neutral-500 transition hover:border-blue-500/50 hover:bg-blue-500/5 hover:text-blue-400"
                          >
                            <IconPlus className="size-3" /> Add
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={() => {
                  onFetch(url, pages);
                  setIsLinking(false);
                }}
                className="mt-2 w-full rounded bg-blue-600 py-2 text-xs font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-500"
              >
                Fetch Row
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function CellImage({
  src,
  alt,
  className = "",
  objectContain = false,
}: {
  src: string;
  alt: string;
  className?: string;
  objectContain?: boolean;
}) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  // Proxy via local API to solve slow Supabase CDN / CORS / connection issues
  const proxyUrl = src.startsWith("http")
    ? `/api/notion-image?src=${encodeURIComponent(src)}`
    : src;

  return (
    <div
      className={`relative h-full w-full overflow-hidden bg-neutral-900 ${className}`}
    >
      {!isLoaded && !hasError && (
        <div className="absolute inset-0 z-0 flex items-center justify-center">
          <div className="h-full w-full animate-pulse bg-neutral-800/60" />
        </div>
      )}
      {hasError && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-neutral-950 p-4 text-center">
          <span className="font-mono text-xs text-red-500">Failed to load</span>
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={proxyUrl}
        alt={alt}
        className={`h-full w-full transition-all duration-700 ease-out ${
          objectContain ? "object-contain" : "object-cover"
        } ${isLoaded && !hasError ? "opacity-100" : "opacity-0"}`}
        onLoad={() => setIsLoaded(true)}
        onError={() => {
          setHasError(true);
          console.error("Failed to load image:", src);
        }}
        draggable={false}
      />
    </div>
  );
}

function PostCell({
  item,
  activeIndex,
  onOpenPreview,
  onEdit,
  onAddCarousel,
  onDelete,
  onDownload,
  onIndexChange,
}: {
  item: InstagramGridItem;
  activeIndex: number;
  onOpenPreview: () => void;
  onEdit: () => void;
  onAddCarousel: () => void;
  onDelete: () => void;
  onDownload: () => void;
  onIndexChange: (index: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { visualIndex, scrollToX } = useCarouselScroll(
    scrollRef,
    item.frames.length,
  );
  const isProgScroll = useRef(false);

  // Sync scroll when parent activeIndex changes
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const target = activeIndex * el.offsetWidth;
    if (Math.abs(el.scrollLeft - target) > 2) {
      isProgScroll.current = true;
      scrollToX(target);
      setTimeout(() => {
        isProgScroll.current = false;
      }, 200);
    }
  }, [activeIndex, scrollToX]);

  // Commit settled index to parent
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout>;
    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (isProgScroll.current) return;
        const w = el.offsetWidth;
        if (!w) return;
        const idx = Math.round(el.scrollLeft / w);
        if (idx !== activeIndex) onIndexChange(idx);
      }, 80);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      el.removeEventListener("scroll", onScroll);
    };
  }, [activeIndex, onIndexChange]);

  return (
    <article className="group relative aspect-3/4 overflow-hidden bg-[#0f0f0f]">
      <div
        ref={scrollRef}
        className="absolute inset-0 flex cursor-pointer snap-x snap-mandatory scrollbar-none overflow-x-auto"
        style={{ scrollbarWidth: "none" }}
        onClick={() => onOpenPreview()}
      >
        {item.frames.map((frame) => (
          <div
            key={frame.id}
            className="h-full w-full shrink-0 snap-center select-none"
          >
            <CellImage src={frame.url} alt={frame.originalName} />
          </div>
        ))}
      </div>

      {item.frames.length > 1 && (
        <div className="pointer-events-none absolute right-2 bottom-2 z-10 flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-[10px] text-white">
          {item.frames.slice(0, 10).map((frameDot, index) => (
            <span
              key={frameDot.id}
              className={`size-1.5 rounded-full transition-colors duration-150 ${
                index === visualIndex ? "bg-white" : "bg-white/35"
              }`}
            />
          ))}
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 z-10 bg-black/0 transition group-hover:bg-black/22" />

      <div className="absolute inset-x-2 bottom-2 z-20 flex translate-y-3 justify-center gap-1.5 opacity-0 transition group-hover:translate-y-0 group-hover:opacity-100">
        <QuickTooltip text="Add carousel">
          <button
            type="button"
            className="grid size-8 place-items-center rounded-full bg-black/72 text-white backdrop-blur transition hover:bg-white hover:text-black"
            onClick={(e) => {
              e.stopPropagation();
              onAddCarousel();
            }}
          >
            <IconLayers className="size-4" />
          </button>
        </QuickTooltip>
        <QuickTooltip text="Replace">
          <button
            type="button"
            className="grid size-8 place-items-center rounded-full bg-black/72 text-white backdrop-blur transition hover:bg-white hover:text-black"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
          >
            <IconRefreshCw className="size-4" />
          </button>
        </QuickTooltip>
        <QuickTooltip text="Download original">
          <button
            type="button"
            className="grid size-8 place-items-center rounded-full bg-black/72 text-white backdrop-blur transition hover:bg-white hover:text-black"
            onClick={(e) => {
              e.stopPropagation();
              onDownload();
            }}
          >
            <IconFileDown className="size-4" />
          </button>
        </QuickTooltip>
        <QuickTooltip text="Download chopped (zip)">
          <button
            type="button"
            className="grid size-8 place-items-center rounded-full bg-black/72 text-white backdrop-blur transition hover:bg-white hover:text-black"
            onClick={(e) => {
              e.stopPropagation();
              onDownload();
            }}
          >
            <IconPackage className="size-4" />
          </button>
        </QuickTooltip>
        <QuickTooltip text="Delete">
          <button
            type="button"
            className="grid size-8 place-items-center rounded-full bg-black/72 text-red-200 backdrop-blur transition hover:bg-red-500 hover:text-white"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <IconTrash className="size-4" />
          </button>
        </QuickTooltip>
      </div>
    </article>
  );
}

function PreviewModal({
  item,
  activeIndex,
  onClose,
  onPrev,
  onNext,
  onEdit,
  onAddCarousel,
  onDelete,
  onDownload,
}: {
  item: InstagramGridItem;
  activeIndex: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onEdit: () => void;
  onAddCarousel: () => void;
  onDelete: () => void;
  onDownload: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { visualIndex, scrollToX } = useCarouselScroll(
    scrollRef,
    item.frames.length,
  );
  const isProgScroll = useRef(false);

  // Keyboard navigation
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (item.frames.length <= 1) return;
      if (event.key === "ArrowLeft") onPrev();
      if (event.key === "ArrowRight") onNext();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [item.frames.length, onClose, onNext, onPrev]);

  // Sync scroll when activeIndex changes from buttons/keyboard
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const target = activeIndex * el.offsetWidth;
    if (Math.abs(el.scrollLeft - target) > 2) {
      isProgScroll.current = true;
      scrollToX(target);
      setTimeout(() => {
        isProgScroll.current = false;
      }, 200);
    }
  }, [activeIndex, scrollToX]);

  // Commit settled index to parent
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout>;
    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (isProgScroll.current) return;
        const w = el.offsetWidth;
        if (!w) return;
        const idx = Math.round(el.scrollLeft / w);
        if (idx > activeIndex) onNext();
        else if (idx < activeIndex) onPrev();
      }, 80);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      el.removeEventListener("scroll", onScroll);
    };
  }, [activeIndex, onNext, onPrev]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Instagram image preview"
    >
      <div
        className="relative flex w-full flex-col items-center justify-center gap-6"
        style={{ maxWidth: "min(90vw, 500px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative w-full overflow-hidden bg-black shadow-2xl">
          {item.frames.length > 1 && (
            <>
              <button
                type="button"
                className="absolute top-1/2 left-3 z-20 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white transition hover:bg-white hover:text-black disabled:opacity-30"
                onClick={(e) => {
                  e.stopPropagation();
                  onPrev();
                }}
                disabled={activeIndex === 0}
                aria-label="Previous image"
              >
                <IconChevronLeft className="size-5" />
              </button>
              <button
                type="button"
                className="absolute top-1/2 right-3 z-20 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white transition hover:bg-white hover:text-black disabled:opacity-30"
                onClick={(e) => {
                  e.stopPropagation();
                  onNext();
                }}
                disabled={activeIndex === item.frames.length - 1}
                aria-label="Next image"
              >
                <IconChevronRight className="size-5" />
              </button>
            </>
          )}

          <div className="aspect-1080/1440 w-full overflow-hidden">
            <div
              ref={scrollRef}
              className="flex h-full snap-x snap-mandatory scrollbar-none overflow-x-auto"
              style={{ scrollbarWidth: "none" }}
            >
              {item.frames.map((frame) => (
                <div
                  key={frame.id}
                  className="h-full w-full shrink-0 snap-center select-none"
                >
                  <CellImage
                    src={frame.url}
                    alt={frame.originalName}
                    objectContain
                  />
                </div>
              ))}
            </div>
          </div>

          {item.frames.length > 1 && (
            <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex items-center justify-center gap-2">
              <div className="flex items-center gap-1.5 rounded-full bg-black/40 px-2 py-1 backdrop-blur-sm">
                {item.frames.map((entry, index) => (
                  <span
                    key={entry.id}
                    className={`size-1.5 rounded-full transition-colors duration-150 ${
                      index === visualIndex ? "bg-white" : "bg-white/35"
                    }`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons Bar */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <QuickTooltip text="Add carousel">
            <button
              type="button"
              className="grid size-12 place-items-center rounded-full border border-white/10 bg-neutral-900 text-white shadow-xl transition hover:scale-110 hover:bg-white hover:text-black"
              onClick={(e) => {
                e.stopPropagation();
                onAddCarousel();
              }}
            >
              <IconLayers className="size-5" />
            </button>
          </QuickTooltip>
          <QuickTooltip text="Replace">
            <button
              type="button"
              className="grid size-12 place-items-center rounded-full border border-white/10 bg-neutral-900 text-white shadow-xl transition hover:scale-110 hover:bg-white hover:text-black"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
            >
              <IconRefreshCw className="size-5" />
            </button>
          </QuickTooltip>
          <QuickTooltip text="Download original">
            <button
              type="button"
              className="grid size-12 place-items-center rounded-full border border-white/10 bg-neutral-900 text-white shadow-xl transition hover:scale-110 hover:bg-white hover:text-black"
              onClick={(e) => {
                e.stopPropagation();
                onDownload();
              }}
            >
              <IconFileDown className="size-5" />
            </button>
          </QuickTooltip>
          <QuickTooltip text="Download chopped (zip)">
            <button
              type="button"
              className="grid size-12 place-items-center rounded-full border border-white/10 bg-neutral-900 text-white shadow-xl transition hover:scale-110 hover:bg-white hover:text-black"
              onClick={(e) => {
                e.stopPropagation();
                onDownload();
              }}
            >
              <IconPackage className="size-5" />
            </button>
          </QuickTooltip>
          <div className="mx-1 h-6 w-px bg-white/10" />
          <QuickTooltip text="Delete">
            <button
              type="button"
              className="grid size-12 place-items-center rounded-full border border-red-500/20 bg-red-500/10 text-red-400 shadow-xl transition hover:scale-110 hover:bg-red-500 hover:text-white"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              <IconTrash className="size-5" />
            </button>
          </QuickTooltip>
        </div>

        <button
          type="button"
          className="mt-2 grid size-10 place-items-center rounded-full bg-white/10 text-white/50 transition hover:bg-white/20 hover:text-white"
          onClick={onClose}
        >
          <IconX className="size-5" />
        </button>
      </div>
    </div>
  );
}
