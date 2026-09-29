import { NextResponse } from "next/server";

import { sendDiscordWebhook } from "@/lib/discord";
import {
  DB_BATCH_PENDAFTARAN,
  DB_PENDAFTARAN_STORAGE,
  DB_SDM_EVALUASI,
  DB_STRUKTUR_ORGANISASI,
  PROP_PENDAFTARAN,
  PROP_SDM,
  PROP_STRUKTUR_ORGANISASI,
} from "@/lib/glossarium";
import {
  fetchBatchMap,
  fetchDivisionsFromNotion,
  getNotionClient,
  getRecruitmentSlotLabel,
  isOpenRecruitmentSlot,
  resolveDatabaseId,
  resolveDataSourceIdSafe,
} from "@/lib/notion";

type PendaftaranPayload = {
  intent?: string;
  data?: {
    firstChoice?: string;
    firstChoicePosition?: string;
    secondChoice?: string;
    secondChoicePosition?: string;
    angkatan?: string;
    pddSubfocus?: string;
    fullName?: string;
    nim?: string;
    email?: string;
    phone?: string;
    instagram?: string;
    motivation?: string;
    experience?: string;
    availability?: string[];
    portfolio?: string;
    submittedAt?: string;
  };
};

const MIN_MOTIVATION_CHARS = 100;
const MAX_MOTIVATION_CHARS = 1500;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NIM_PATTERN = /^\d{10,12}$/;
const PHONE_PATTERN = /^(?:\+62|62|0)8\d{7,11}$/;

const divisionLabels: Record<string, string> = {
  humas: "Humas & Kemitraan",
  "program-event": "Divisi Program & Event",
  pdd: "Publikasi, Desain & Dokumentasi",
  "co-sekretaris": "Co-Sekretaris",
  "co-bendahara": "Co-Bendahara",
};

const ANGKATAN_RESTRICTED_POSITIONS = ["co-sekretaris", "co-bendahara"];
const VALID_PDD_SUBFOCUS = ["desain", "publikasi", "dokumentasi"];

const pddSubfocusLabels: Record<string, string> = {
  desain: "Desain",
  publikasi: "Publikasi & Media Sosial",
  dokumentasi: "Dokumentasi",
};

const htmlEscapes: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => htmlEscapes[char] ?? char);

const DISCORD_FIELD_LIMIT = 1024;

const truncate = (value: string, maxLength = DISCORD_FIELD_LIMIT) =>
  value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;

const pendaftaranCooldownMs = 5 * 60 * 1000;

const pendaftaranLastSubmit = new Map<string, number>();

async function writePendaftaranToNotion(data: {
  firstChoice: string;
  firstChoicePosition?: string;
  secondChoice: string;
  secondChoicePosition?: string;
  angkatan: string;
  pddSubfocus: string;
  fullName: string;
  nim: string;
  email: string;
  phone: string;
  instagram: string;
  motivation: string;
  experience: string;
  availability: string[];
  portfolio: string;
}) {
  const notion = getNotionClient();
  if (!notion) return;

  const storageDbId = DB_PENDAFTARAN_STORAGE;
  if (!storageDbId || storageDbId.includes("placeholder")) {
    console.warn(
      "[Notion Pendaftaran] DB_PENDAFTARAN_STORAGE not configured. Skipping Notion write.",
    );
    return;
  }

  // 1 & 2. Find division pages and SDM slots for choices
  const structDbId = DB_STRUKTUR_ORGANISASI;
  const sdmDbId = DB_SDM_EVALUASI;

  let batchPageId: string | null = null;
  let batchMap: Awaited<ReturnType<typeof fetchBatchMap>> = {};
  let currentBatchNum = NaN;
  try {
    const { fetchContainerCMSCached } = await import("@/lib/notion-builder");
    const cms = await fetchContainerCMSCached();
    const currentBatchStr = cms?.variables?.CURRENT_BATCH || "2";
    currentBatchNum = parseInt(currentBatchStr, 10);
    batchMap = await fetchBatchMap();
    const currentBatchInfo = Object.values(batchMap).find(
      (batch) => batch.batchNum === currentBatchNum,
    );
    if (currentBatchInfo) {
      batchPageId = currentBatchInfo.id;
    }
  } catch (err) {
    console.error(
      "[Notion Pendaftaran] Failed to fetch current batch id:",
      err,
    );
  }

  const dataSourcePagesCache = new Map<string, Promise<any[]>>();
  const queryAllDataSourcePages = (dataSourceId: string) => {
    const cached = dataSourcePagesCache.get(dataSourceId);
    if (cached) return cached;

    const request = (async () => {
      const pages: any[] = [];
      let cursor: string | undefined;

      do {
        const response = await notion.dataSources.query({
          data_source_id: dataSourceId,
          start_cursor: cursor,
          page_size: 100,
        });
        pages.push(...(response.results as any[]));
        cursor = response.has_more
          ? (response.next_cursor ?? undefined)
          : undefined;
      } while (cursor);

      return pages;
    })();

    dataSourcePagesCache.set(dataSourceId, request);
    return request;
  };

  const relatedPageIds = (page: any, propertyName: string): string[] => {
    const property = page.properties?.[propertyName];
    return property?.type === "relation" && Array.isArray(property.relation)
      ? property.relation.map((relation: { id: string }) => relation.id)
      : [];
  };

  const pageTitleCache = new Map<string, string>();
  const fetchPageTitle = async (pageId: string) => {
    const cached = pageTitleCache.get(pageId);
    if (cached !== undefined) return cached;

    const page = (await notion.pages.retrieve({ page_id: pageId })) as {
      properties?: Record<string, any>;
    };
    const titleProperty = Object.values(page.properties || {}).find(
      (property) => property.type === "title",
    );
    const title =
      titleProperty?.type === "title"
        ? titleProperty.title
            .map((text: { plain_text?: string }) => text.plain_text || "")
            .join("")
            .trim()
        : "";
    pageTitleCache.set(pageId, title);
    return title;
  };

  const resolveSlot = async (choiceSlug: string, choicePosition?: string) => {
    if (!choiceSlug || !structDbId || !sdmDbId || !batchPageId)
      return { divPageId: null, sdmSlotId: null };
    let divPageId: string | null = null;
    let sdmSlotId: string | null = null;

    const slugify = (text: string) =>
      text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

    try {
      const dsId = await resolveDataSourceIdSafe(structDbId);
      if (dsId) {
        const pages = await queryAllDataSourcePages(dsId);
        const match = pages.find((p) => {
          const titleProperty =
            p.properties?.[PROP_STRUKTUR_ORGANISASI.NAMA_DIVISI];
          const title =
            titleProperty?.type === "title"
              ? titleProperty.title
                  .map((text: { plain_text?: string }) => text.plain_text || "")
                  .join("")
              : "";
          return slugify(title) === choiceSlug || p.id === choiceSlug;
        });
        if (match) divPageId = match.id;
      }
    } catch (e) {
      console.warn("[Notion Pendaftaran] Failed to resolve division page:", e);
    }

    if (divPageId) {
      try {
        const dsId = await resolveDataSourceIdSafe(sdmDbId);
        if (dsId) {
          const pages = await queryAllDataSourcePages(dsId);
          const targetPosSlug = choicePosition ? slugify(choicePosition) : "";
          // Same open-slot rule as the divisions list shown in the form.
          const candidates = pages.filter(
            (page) =>
              isOpenRecruitmentSlot(page, batchMap, currentBatchNum) &&
              relatedPageIds(page, PROP_SDM.STRUKTUR_ORGANISASI).includes(
                divPageId!,
              ),
          );

          if (targetPosSlug) {
            const titles = new Map<string, string>();
            const roleIds = new Set(
              candidates.flatMap((candidate) => [
                ...relatedPageIds(candidate, PROP_SDM.NAMA_JABATAN),
                ...relatedPageIds(candidate, PROP_SDM.TIPE_JABATAN),
              ]),
            );
            await Promise.all(
              [...roleIds].map(async (roleId) =>
                titles.set(roleId, await fetchPageTitle(roleId)),
              ),
            );
            const match = candidates.find(
              (candidate) =>
                slugify(getRecruitmentSlotLabel(candidate, titles)) ===
                targetPosSlug,
            );
            if (match) sdmSlotId = match.id;
          } else if (candidates.length === 1) {
            sdmSlotId = candidates[0].id;
          }
        }
      } catch (e) {
        console.warn(
          "[Notion Pendaftaran] Failed to resolve SDM slot page:",
          e,
        );
      }
    }
    return { divPageId, sdmSlotId };
  };

  const firstSlot = await resolveSlot(
    data.firstChoice,
    data.firstChoicePosition,
  );
  const secondSlot = await resolveSlot(
    data.secondChoice,
    data.secondChoicePosition,
  );

  // 3. Query schema of DB_PENDAFTARAN_STORAGE to map properties
  let dbProperties: Record<string, any> = {};
  let resolvedStorageDbId = storageDbId;
  let parentObj: Parameters<typeof notion.pages.create>[0]["parent"] = {
    database_id: storageDbId,
  };

  try {
    resolvedStorageDbId = await resolveDatabaseId(storageDbId);

    // Convert to 32-char UUID with dashes if needed
    if (!resolvedStorageDbId.includes("-")) {
      resolvedStorageDbId = `${resolvedStorageDbId.slice(0, 8)}-${resolvedStorageDbId.slice(8, 12)}-${resolvedStorageDbId.slice(12, 16)}-${resolvedStorageDbId.slice(16, 20)}-${resolvedStorageDbId.slice(20)}`;
    }

    parentObj = {
      database_id: resolvedStorageDbId,
    };

    const dbInfo = (await notion.databases.retrieve({
      database_id: resolvedStorageDbId,
    })) as {
      data_sources?: { id: string }[];
      properties?: Record<string, any>;
    };

    const dataSourceId = dbInfo.data_sources?.[0]?.id;
    if (dataSourceId) {
      parentObj = { data_source_id: dataSourceId };

      const dataSourceInfo = (await notion.dataSources.retrieve({
        data_source_id: dataSourceId,
      })) as {
        properties?: Record<string, any>;
      };

      if (dataSourceInfo?.properties) {
        dbProperties = dataSourceInfo.properties;
      }
    }

    if (Object.keys(dbProperties).length === 0 && dbInfo?.properties) {
      dbProperties = dbInfo.properties;
    }
  } catch (err) {
    console.error(
      "[Notion Pendaftaran] Failed to retrieve storage DB schema:",
      err,
    );
  }

  const resolveRelationTargetIds = async (database: string) => {
    const databaseId = await resolveDatabaseId(database);
    const dataSourceId = await resolveDataSourceIdSafe(databaseId);

    return [databaseId, dataSourceId]
      .filter((id): id is string => Boolean(id))
      .map((id) => id.replace(/-/g, ""));
  };

  const [sdmTargetIds, batchTargetIds] = await Promise.all([
    resolveRelationTargetIds(sdmDbId),
    resolveRelationTargetIds(DB_BATCH_PENDAFTARAN),
  ]);

  const relationTargets = (schema: any, targetIds: string[]) => {
    const relationIds = [
      schema.relation?.database_id,
      schema.relation?.data_source_id,
    ]
      .filter((id): id is string => Boolean(id))
      .map((id) => id.replace(/-/g, ""));

    return relationIds.some((id) => targetIds.includes(id));
  };

  const requiredSchema: Array<[string, string]> = [
    [PROP_PENDAFTARAN.NAME, "title"],
    [PROP_PENDAFTARAN.NIM, "rich_text"],
    [PROP_PENDAFTARAN.KONTAK, "rich_text"],
    [PROP_PENDAFTARAN.MOTIVASI, "rich_text"],
    [PROP_PENDAFTARAN.LINK_PORTFOLIO, "rich_text"],
    [PROP_PENDAFTARAN.STATUS_SELEKSI, "status"],
    [PROP_PENDAFTARAN.BATCH_PENDAFTARAN, "relation"],
    [PROP_PENDAFTARAN.SDM_EVALUASI_PILIHAN_1, "relation"],
    [PROP_PENDAFTARAN.SDM_EVALUASI_PILIHAN_2, "relation"],
  ];
  const incompatibleSchema = requiredSchema.filter(
    ([name, type]) => dbProperties[name]?.type !== type,
  );

  if (incompatibleSchema.length > 0) {
    throw new Error(
      `Notion registration schema mismatch: ${incompatibleSchema
        .map(([name, type]) => `${name} (${type})`)
        .join(", ")}`,
    );
  }
  if (!batchPageId) {
    throw new Error("Current Notion registration batch could not be resolved.");
  }
  if (!firstSlot.sdmSlotId) {
    throw new Error(
      `Notion recruitment slot could not be resolved for first choice: ${data.firstChoice}`,
    );
  }
  if (data.secondChoice && !secondSlot.sdmSlotId) {
    throw new Error(
      `Notion recruitment slot could not be resolved for second choice: ${data.secondChoice}`,
    );
  }

  const properties: Record<string, any> = {};

  for (const [name, schema] of Object.entries(dbProperties)) {
    const type = schema.type;

    if (name === PROP_PENDAFTARAN.NAME && type === "title") {
      properties[name] = {
        title: [{ text: { content: data.fullName } }],
      };
    } else if (name === PROP_PENDAFTARAN.NIM && type === "rich_text") {
      properties[name] = { rich_text: [{ text: { content: data.nim } }] };
    } else if (name === PROP_PENDAFTARAN.KONTAK && type === "rich_text") {
      properties[name] = {
        rich_text: [
          {
            text: {
              content: `Email: ${data.email}\nWA: ${data.phone}\nIG: ${data.instagram || "-"}`,
            },
          },
        ],
      };
    } else if (name === PROP_PENDAFTARAN.MOTIVASI && type === "rich_text") {
      properties[name] = {
        rich_text: [{ text: { content: data.motivation } }],
      };
    } else if (
      name === PROP_PENDAFTARAN.LINK_PORTFOLIO &&
      type === "rich_text"
    ) {
      properties[name] = {
        rich_text: [{ text: { content: data.portfolio } }],
      };
    } else if (name === PROP_PENDAFTARAN.STATUS_SELEKSI && type === "status") {
      properties[name] = { status: { name: "Masuk" } };
    } else if (type === "relation") {
      if (
        name === PROP_PENDAFTARAN.SDM_EVALUASI_PILIHAN_1 &&
        relationTargets(schema, sdmTargetIds)
      ) {
        properties[name] = { relation: [{ id: firstSlot.sdmSlotId }] };
      } else if (
        name === PROP_PENDAFTARAN.SDM_EVALUASI_PILIHAN_2 &&
        relationTargets(schema, sdmTargetIds) &&
        secondSlot.sdmSlotId
      ) {
        properties[name] = { relation: [{ id: secondSlot.sdmSlotId }] };
      } else if (
        name === PROP_PENDAFTARAN.BATCH_PENDAFTARAN &&
        relationTargets(schema, batchTargetIds)
      ) {
        properties[name] = { relation: [{ id: batchPageId }] };
      }
    }
  }

  if (Object.keys(dbProperties).length === 0) {
    throw new Error(
      "Notion storage schema is unavailable. Check integration access to the registration data source.",
    );
  }

  if (Object.keys(properties).length === 0) {
    throw new Error(
      "Notion storage schema was loaded, but no compatible registration fields were found.",
    );
  }

  await notion.pages.create({
    parent: parentObj,
    properties: properties as any,
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as PendaftaranPayload;
    const { intent, data } = body;

    if (intent !== "submit-pendaftaran") {
      return NextResponse.json(
        { error: "Invalid submit intent" },
        { status: 400 },
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Missing registration data" },
        { status: 400 },
      );
    }

    const firstChoice =
      typeof data.firstChoice === "string" ? data.firstChoice.trim() : "";
    const firstChoicePosition =
      typeof data.firstChoicePosition === "string"
        ? data.firstChoicePosition.trim()
        : "";
    const secondChoice =
      typeof data.secondChoice === "string" ? data.secondChoice.trim() : "";
    const secondChoicePosition =
      typeof data.secondChoicePosition === "string"
        ? data.secondChoicePosition.trim()
        : "";
    const angkatan =
      typeof data.angkatan === "string" ? data.angkatan.trim() : "";
    const pddSubfocus =
      typeof data.pddSubfocus === "string" ? data.pddSubfocus.trim() : "";
    const fullName =
      typeof data.fullName === "string" ? data.fullName.trim() : "";
    const nim = typeof data.nim === "string" ? data.nim.trim() : "";
    const email = typeof data.email === "string" ? data.email.trim() : "";
    const phone =
      typeof data.phone === "string"
        ? data.phone.trim().replace(/\D/g, "")
        : "";
    const instagram =
      typeof data.instagram === "string" ? data.instagram.trim() : "";
    const motivation =
      typeof data.motivation === "string" ? data.motivation.trim() : "";
    const experience =
      typeof data.experience === "string" ? data.experience.trim() : "";
    const availability = Array.isArray(data.availability)
      ? data.availability
          .filter((item) => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean)
      : [];
    const portfolio =
      typeof data.portfolio === "string" ? data.portfolio.trim() : "";
    const isPddSelected = firstChoice === "pdd" || secondChoice === "pdd";

    if (!firstChoice) {
      return NextResponse.json(
        { error: "Divisi prioritas 1 wajib dipilih." },
        { status: 400 },
      );
    }

    if (secondChoice && secondChoice === firstChoice) {
      return NextResponse.json(
        { error: "Divisi prioritas 2 harus berbeda dari prioritas 1." },
        { status: 400 },
      );
    }

    const {
      divisions: openDivisions,
      angkatanList,
      juniorAngkatan,
    } = await fetchDivisionsFromNotion();
    const isJuniorApplicant =
      Boolean(juniorAngkatan) && angkatan === juniorAngkatan;
    const VALID_ANGKATAN = angkatanList;

    // Only divisions/positions that still have an open "Rekrutmen" slot.
    const validateChoice = (
      choice: string,
      position: string,
      label: string,
    ): string | null => {
      const division = openDivisions.find((d) => d.id === choice);
      if (!division) {
        return `Divisi pilihan ${label} sudah tidak membuka rekrutmen. Silakan pilih divisi lain.`;
      }
      const positions = division.openPositions ?? [];
      if (positions.length > 0 && !positions.includes(position)) {
        return `Jabatan pilihan ${label} sudah terisi atau tidak tersedia. Silakan pilih jabatan lain.`;
      }
      if (
        isJuniorApplicant &&
        division.juniorPositions &&
        !division.juniorPositions.includes(position)
      ) {
        return `Angkatan ${juniorAngkatan} hanya dapat mendaftar sebagai Staf Muda. Silakan ganti jabatan pilihan ${label}.`;
      }
      return null;
    };

    const choiceError =
      validateChoice(firstChoice, firstChoicePosition, "1") ||
      (secondChoice
        ? validateChoice(secondChoice, secondChoicePosition, "2")
        : null);
    if (choiceError) {
      return NextResponse.json({ error: choiceError }, { status: 400 });
    }

    if (!angkatan || !VALID_ANGKATAN.includes(angkatan)) {
      return NextResponse.json(
        { error: "Pilihan angkatan tidak valid atau wajib diisi." },
        { status: 400 },
      );
    }

    if (
      ANGKATAN_RESTRICTED_POSITIONS.includes(firstChoice) &&
      angkatan === "2023"
    ) {
      return NextResponse.json(
        {
          error:
            "Posisi Co-Sekretaris dan Co-Bendahara hanya tersedia untuk angkatan 2024\u20132025.",
        },
        { status: 400 },
      );
    }

    if (pddSubfocus && !VALID_PDD_SUBFOCUS.includes(pddSubfocus)) {
      return NextResponse.json(
        { error: "Sub-fokus PDD tidak valid." },
        { status: 400 },
      );
    }

    if (!fullName) {
      return NextResponse.json(
        { error: "Nama lengkap wajib diisi." },
        { status: 400 },
      );
    }

    if (!nim) {
      return NextResponse.json({ error: "NIM wajib diisi." }, { status: 400 });
    }

    if (!NIM_PATTERN.test(nim)) {
      return NextResponse.json(
        { error: "NIM harus 10–12 digit angka." },
        { status: 400 },
      );
    }

    if (!email) {
      return NextResponse.json(
        { error: "Email wajib diisi." },
        { status: 400 },
      );
    }

    if (!EMAIL_PATTERN.test(email)) {
      return NextResponse.json(
        { error: "Format email tidak valid." },
        { status: 400 },
      );
    }

    if (!phone) {
      return NextResponse.json(
        { error: "Nomor WhatsApp wajib diisi." },
        { status: 400 },
      );
    }

    if (!PHONE_PATTERN.test(phone)) {
      return NextResponse.json(
        { error: "Gunakan format 08xxxxxxxxxx atau +628xxxxxxxxxx." },
        { status: 400 },
      );
    }

    if (!motivation) {
      return NextResponse.json(
        { error: "Motivasi wajib diisi." },
        { status: 400 },
      );
    }

    if (
      motivation.length < MIN_MOTIVATION_CHARS ||
      motivation.length > MAX_MOTIVATION_CHARS
    ) {
      return NextResponse.json(
        {
          error: `Motivasi harus ${MIN_MOTIVATION_CHARS}–${MAX_MOTIVATION_CHARS} karakter.`,
        },
        { status: 400 },
      );
    }

    if (availability.length === 0) {
      return NextResponse.json(
        { error: "Pilih minimal satu ketersediaan waktu." },
        { status: 400 },
      );
    }

    const now = Date.now();
    const lastSubmit = pendaftaranLastSubmit.get(email) ?? 0;
    const elapsed = now - lastSubmit;

    if (elapsed < pendaftaranCooldownMs) {
      const retryAfterMs = pendaftaranCooldownMs - elapsed;
      return NextResponse.json(
        {
          error:
            "Kamu baru saja mengirim pendaftaran. Coba lagi beberapa menit lagi.",
          retryAfterMs,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil(retryAfterMs / 1000)),
          },
        },
      );
    }

    try {
      await writePendaftaranToNotion({
        firstChoice,
        firstChoicePosition,
        secondChoice,
        secondChoicePosition,
        angkatan,
        pddSubfocus,
        fullName,
        nim,
        email,
        phone,
        instagram,
        motivation,
        experience,
        availability,
        portfolio,
      });
    } catch (notionError) {
      console.error("[Pendaftaran API] Notion write failed:", notionError);
      return NextResponse.json(
        {
          error: "Gagal menyimpan data pendaftaran ke Notion.",
          details:
            notionError instanceof Error
              ? notionError.message
              : String(notionError),
        },
        { status: 500 },
      );
    }

    const apiKey = process.env.BREVO_API_KEY;
    const fromEmail = process.env.BREVO_SENDER_EMAIL || "musikisiyk@gmail.com";
    const adminEmail = process.env.ADMIN_EMAIL;

    if (!apiKey || !fromEmail) {
      console.error("Missing email configuration", {
        hasApiKey: !!apiKey,
        hasFromEmail: !!fromEmail,
      });
      return NextResponse.json(
        { error: "Server misconfiguration: Email is not configured" },
        { status: 500 },
      );
    }

    const subject = "Bukti Pendaftaran HIMA Musik";

    const submittedAt = new Date();

    const submittedAtFormatted = submittedAt.toLocaleString("id-ID", {
      dateStyle: "full",
      timeStyle: "short",
    });

    const divisionLabel = divisionLabels[firstChoice] ?? firstChoice;
    const firstChoiceFullLabel = firstChoicePosition
      ? `${divisionLabel} - ${firstChoicePosition}`
      : divisionLabel;
    const secondaryDivisionLabel = secondChoice
      ? (divisionLabels[secondChoice] ?? secondChoice)
      : "";
    const secondChoiceFullLabel = secondChoicePosition
      ? `${secondaryDivisionLabel} - ${secondChoicePosition}`
      : secondaryDivisionLabel;
    const subfocusLabel =
      isPddSelected && pddSubfocus
        ? (pddSubfocusLabels[pddSubfocus] ?? pddSubfocus)
        : "";
    const safeFullName = escapeHtml(fullName || "Calon Pengurus");
    const safeEmail = escapeHtml(email);
    const safeNim = escapeHtml(nim);
    const safePhone = escapeHtml(phone);
    const safeInstagram = escapeHtml(instagram);
    const safeDivisionLabel = escapeHtml(firstChoiceFullLabel || "-");
    const safeSecondaryDivisionLabel = escapeHtml(secondChoiceFullLabel);
    const safeSubfocusLabel = escapeHtml(subfocusLabel);
    const safeAngkatan = escapeHtml(angkatan);
    const safeAvailability = availability.map((item) => escapeHtml(item));
    const safePortfolio = escapeHtml(portfolio);
    const safeMotivation = escapeHtml(motivation);
    const safeExperience = escapeHtml(experience);
    const safeMotivationHtml = safeMotivation.replace(/\n/g, "<br />");
    const safeExperienceHtml = safeExperience.replace(/\n/g, "<br />");

    const html = `
      <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #050505; color: #e5e5e5; padding: 24px;">
        <div style="max-width: 520px; margin: 0 auto; background-color: #0b0b0b; border: 1px solid rgba(255,255,255,0.08); padding: 24px; border-radius: 16px;">
          <p style="font-size: 10px; letter-spacing: 0.3em; text-transform: uppercase; color: #d4a64d; margin: 0 0 16px;">
            Bukti Pendaftaran
          </p>
          <h1 style="font-size: 24px; margin: 0 0 16px; color: #f5f5f5;">
            Terima kasih, ${safeFullName}.
          </h1>
          <p style="font-size: 14px; line-height: 1.6; color: #a3a3a3; margin: 0 0 20px;">
            Pendaftaran kamu sebagai calon pengurus HIMA Musik telah kami terima.
            Tim akan menghubungi kamu melalui email atau WhatsApp untuk informasi tahap berikutnya.
          </p>
          <div style="border: 1px solid rgba(255,255,255,0.08); background-color: rgba(255,255,255,0.02); padding: 16px; margin-bottom: 20px; border-radius: 12px;">
            <p style="font-size: 10px; letter-spacing: 0.3em; text-transform: uppercase; color: #737373; margin: 0 0 8px;">
              Ringkasan Pendaftaran
            </p>
            <p style="font-size: 14px; margin: 0 0 4px;"><strong>Nama:</strong> ${safeFullName || "-"}</p>
            ${nim ? `<p style="font-size: 14px; margin: 0 0 4px;"><strong>NIM:</strong> ${safeNim}</p>` : ""}
            <p style="font-size: 14px; margin: 0 0 4px;"><strong>Waktu:</strong> ${submittedAtFormatted}</p>
            <p style="font-size: 14px; margin: 0 0 4px;"><strong>Divisi prioritas 1:</strong> ${safeDivisionLabel}</p>
            ${
              secondaryDivisionLabel
                ? `<p style="font-size: 14px; margin: 0 0 4px;"><strong>Divisi prioritas 2:</strong> ${safeSecondaryDivisionLabel}</p>`
                : ""
            }
            <p style="font-size: 14px; margin: 0 0 4px;"><strong>Angkatan:</strong> ${safeAngkatan}</p>
            ${
              subfocusLabel
                ? `<p style="font-size: 14px; margin: 0 0 4px;"><strong>Sub-fokus PDD:</strong> ${safeSubfocusLabel}</p>`
                : ""
            }
            <p style="font-size: 14px; margin: 0 0 4px;"><strong>Email:</strong> ${safeEmail}</p>
            ${phone ? `<p style="font-size: 14px; margin: 0 0 4px;"><strong>WhatsApp:</strong> ${safePhone}</p>` : ""}
            ${instagram ? `<p style="font-size: 14px; margin: 0;"><strong>Instagram:</strong> ${safeInstagram}</p>` : ""}
          </div>
          <div style="border: 1px solid rgba(255,255,255,0.06); background-color: rgba(255,255,255,0.01); padding: 16px; margin-bottom: 20px; border-radius: 12px;">
            <p style="font-size: 10px; letter-spacing: 0.3em; text-transform: uppercase; color: #737373; margin: 0 0 8px;">
              Motivasi
            </p>
            <p style="font-size: 13px; margin: 0; color: #d4d4d4; white-space: pre-line;">
              ${safeMotivationHtml}
            </p>
          </div>
          ${
            experience
              ? `
          <div style="border: 1px solid rgba(255,255,255,0.06); background-color: rgba(255,255,255,0.01); padding: 16px; margin-bottom: 20px; border-radius: 12px;">
            <p style="font-size: 10px; letter-spacing: 0.3em; text-transform: uppercase; color: #737373; margin: 0 0 8px;">
              Pengalaman
            </p>
            <p style="font-size: 13px; margin: 0; color: #d4d4d4; white-space: pre-line;">
              ${safeExperienceHtml}
            </p>
          </div>
              `
              : ""
          }
          ${
            availability.length > 0
              ? `
          <div style="border: 1px solid rgba(255,255,255,0.06); background-color: rgba(255,255,255,0.01); padding: 16px; margin-bottom: 20px; border-radius: 12px;">
            <p style="font-size: 10px; letter-spacing: 0.3em; text-transform: uppercase; color: #737373; margin: 0 0 8px;">
              Ketersediaan Waktu
            </p>
            <p style="font-size: 13px; margin: 0; color: #d4d4d4;">
              ${safeAvailability.join(", ")}
            </p>
          </div>
              `
              : ""
          }
          ${
            portfolio
              ? `
          <div style="border: 1px solid rgba(255,255,255,0.06); background-color: rgba(255,255,255,0.01); padding: 16px; margin-bottom: 20px; border-radius: 12px;">
            <p style="font-size: 10px; letter-spacing: 0.3em; text-transform: uppercase; color: #737373; margin: 0 0 8px;">
              Portofolio / Lampiran
            </p>
            <p style="font-size: 13px; margin: 0; color: #d4d4d4; white-space: pre-line;">
              ${safePortfolio}
            </p>
          </div>
              `
              : ""
          }
          <p style="font-size: 12px; line-height: 1.6; color: #737373; margin: 0 0 12px;">
            Simpan email ini sebagai bukti pendaftaran. Jika ada data yang tidak sesuai,
            kamu bisa membalas email ini ke panitia.
          </p>
          <p style="font-size: 12px; line-height: 1.6; color: #737373; margin: 0 0 16px;">
            Jika email ini muncul di folder <span style="color:#e5e5e5;">Spam</span> atau
            <span style="color:#e5e5e5;">Junk</span>, tandai sebagai
            <span style="color:#e5e5e5;"> “Bukan spam” </span> dan pindahkan ke kotak masuk
            utama supaya informasi berikutnya tidak terlewat.
          </p>
          <p style="font-size: 12px; line-height: 1.6; color: #525252; margin: 0;">
            Salam hangat,<br/>
            HIMA Musik
          </p>
        </div>
      </div>
    `;

    const textLines = [
      "Bukti Pendaftaran HIMA Musik",
      "",
      `Nama           : ${fullName || "-"}`,
      nim ? `NIM            : ${nim}` : "",
      `Waktu          : ${submittedAtFormatted}`,
      `Divisi prio 1  : ${divisionLabel}`,
      secondaryDivisionLabel
        ? `Divisi prio 2  : ${secondaryDivisionLabel}`
        : "",
      `Angkatan       : ${angkatan}`,
      subfocusLabel ? `Sub-fokus PDD  : ${subfocusLabel}` : "",
      `Email          : ${email}`,
      phone ? `WhatsApp       : ${phone}` : "",
      instagram ? `Instagram      : ${instagram}` : "",
      availability.length > 0
        ? `Ketersediaan   : ${availability.join(", ")}`
        : "",
      motivation ? `Motivasi      : ${motivation}` : "",
      experience ? `Pengalaman    : ${experience}` : "",
      portfolio ? `Portofolio    : ${portfolio}` : "",
      "",
      "Simpan email ini sebagai bukti pendaftaran.",
      'Jika email ini masuk ke folder Spam/Junk, tandai sebagai "Bukan spam"',
      "agar informasi berikutnya tidak terlewat.",
      "",
      "Salam hangat,",
      "HIMA Musik",
    ].filter(Boolean);

    const text = textLines.join("\n");

    const brevoPayload = {
      sender: {
        email: fromEmail,
      },
      to: [
        {
          email,
          name: fullName || email,
        },
      ],
      ...(adminEmail
        ? {
            bcc: [
              {
                email: adminEmail,
              },
            ],
          }
        : {}),
      subject,
      htmlContent: html,
      textContent: text,
    };

    pendaftaranLastSubmit.set(email, now);

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(brevoPayload),
    });

    if (!response.ok) {
      const responseText = await response.text();
      console.error("Email API error", {
        status: response.status,
        body: responseText,
      });
      return NextResponse.json(
        { error: "Failed to send registration email" },
        { status: 500 },
      );
    }

    const webhookUrl = process.env.DISCORD_PENDAFTARAN_WEBHOOK_URL;

    if (webhookUrl) {
      try {
        await sendDiscordWebhook(
          webhookUrl,
          {
            username: "HIMA Musik Pendaftaran",
            allowed_mentions: { parse: [] },
            embeds: [
              {
                title: "Pendaftaran Baru Masuk",
                description: "Email bukti pendaftaran sudah terkirim.",
                color: 0x57f287,
                timestamp: submittedAt.toISOString(),
                fields: [
                  { name: "Nama", value: truncate(fullName), inline: true },
                  { name: "NIM", value: truncate(nim || "-"), inline: true },
                  {
                    name: "Angkatan",
                    value: truncate(angkatan),
                    inline: true,
                  },
                  { name: "Email", value: truncate(email), inline: true },
                  {
                    name: "WhatsApp",
                    value: truncate(phone || "-"),
                    inline: true,
                  },
                  {
                    name: "Instagram",
                    value: truncate(instagram || "-"),
                    inline: true,
                  },
                  {
                    name: "Divisi 1",
                    value: truncate(firstChoiceFullLabel),
                    inline: true,
                  },
                  ...(secondChoiceFullLabel
                    ? [
                        {
                          name: "Divisi 2",
                          value: truncate(secondChoiceFullLabel),
                          inline: true,
                        },
                      ]
                    : []),
                  ...(subfocusLabel
                    ? [
                        {
                          name: "Sub-fokus PDD",
                          value: truncate(subfocusLabel),
                          inline: true,
                        },
                      ]
                    : []),
                  {
                    name: "Ketersediaan",
                    value: truncate(availability.join(", ")),
                    inline: false,
                  },
                  ...(portfolio
                    ? [
                        {
                          name: "Portofolio / Lampiran",
                          value: truncate(portfolio),
                          inline: false,
                        },
                      ]
                    : []),
                  {
                    name: "Waktu",
                    value: submittedAtFormatted,
                    inline: false,
                  },
                ],
                footer: { text: "HIMA Musik Official Portal" },
              },
            ],
          },
          "Success notification to Discord",
        );
      } catch (discordError) {
        console.error(
          "Failed to send success notification to Discord:",
          discordError,
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error handling registration email", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
