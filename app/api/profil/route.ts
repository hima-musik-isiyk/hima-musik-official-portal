import { connection, NextResponse } from "next/server";

import { cleanCmsValue } from "@/lib/cms-placeholders";
import { fetchProfilOrgStructure } from "@/lib/notion";
import {
  fetchContainerCMS,
  resolveCmsComponentDatabaseId,
  resolveProfilMaxBatchFromCms,
} from "@/lib/notion-builder";

export async function GET(request: Request) {
  await connection();
  const { searchParams } = new URL(request.url);
  try {
    let databaseId = cleanCmsValue(searchParams.get("databaseId"), [
      "Database ID",
    ]);
    const batchParam = cleanCmsValue(searchParams.get("batch"), [
      "Tampilkan Batch dari 1 Sampai",
    ]);

    const cms = await fetchContainerCMS();

    if (!databaseId) {
      databaseId =
        resolveCmsComponentDatabaseId(
          cms,
          "Struktur Organisasi Graph",
          "value2",
        ) ??
        resolveCmsComponentDatabaseId(cms, "Struktur Kabinet", "value2") ??
        resolveCmsComponentDatabaseId(cms, "Struktur Organisasi", "value2") ??
        "";
    }

    if (!databaseId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Missing SDM database ID. Set it on Struktur Organisasi Graph (Value 2) in Container CMS.",
        },
        { status: 400 },
      );
    }

    const maxBatch = batchParam
      ? Number.parseInt(batchParam, 10)
      : resolveProfilMaxBatchFromCms(cms);

    const data = await fetchProfilOrgStructure({
      sdmDatabaseId: databaseId,
      maxBatch: Number.isNaN(maxBatch) ? 999 : maxBatch,
    });

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("[Profil API GET] Error:", error);
    return NextResponse.json(
      {
        error: "Gagal mengambil data Profil",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
