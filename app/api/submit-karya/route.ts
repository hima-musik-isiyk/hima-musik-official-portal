import { NextResponse } from "next/server";

import { generateKaryaEmailTemplate, sendBrevoEmail } from "@/lib/brevo";
import { sendDiscordWebhook } from "@/lib/discord";
import { DB_KARYA_FORM_STORAGE, PROP_KARYA } from "@/lib/glossarium";
import { getNotionClient, resolveDatabaseId } from "@/lib/notion";

export async function POST(request: Request) {
  const DISCORD_WEBHOOK_URL = process.env.DISCORD_KARYA_WEBHOOK_URL;

  try {
    const activeDbId = await resolveDatabaseId(DB_KARYA_FORM_STORAGE);
    if (!activeDbId) {
      return NextResponse.json(
        { error: "Karya Database ID could not be resolved" },
        { status: 500 },
      );
    }

    const body = await request.json();
    const { title, creator, nim, genres, platform, embedLink, email } = body;

    // Simple validation
    if (!title || !creator || !nim || !platform || !embedLink) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const notion = getNotionClient();
    if (!notion) {
      return NextResponse.json(
        { error: "Notion client not initialized" },
        { status: 500 },
      );
    }

    const response = await notion.pages.create({
      parent: { database_id: activeDbId },
      properties: {
        [PROP_KARYA.JUDUL_KARYA]: {
          title: [{ text: { content: title } }],
        },
        [PROP_KARYA.STATUS]: { status: { name: "Masuk" } },
        [PROP_KARYA.PENCIPTA_PENAMPIL]: {
          rich_text: [{ text: { content: creator } }],
        },
        [PROP_KARYA.NIM_PENANGGUNG_JAWAB]: {
          number: parseInt(nim, 10),
        },
        [PROP_KARYA.EMAIL]: {
          email: email || "",
        },
        [PROP_KARYA.GENRE_JENIS_KARYA]: {
          multi_select: (genres || []).map((g: string) => ({ name: g })),
        },
        [PROP_KARYA.PLATFORM_UTAMA]: {
          multi_select: [{ name: platform }],
        },
        [PROP_KARYA.LINK_EMBED]: {
          url: embedLink,
        },
      } as Parameters<typeof notion.pages.create>[0]["properties"],
    });

    if (DISCORD_WEBHOOK_URL) {
      try {
        await sendDiscordWebhook(
          DISCORD_WEBHOOK_URL,
          {
            username: "HIMA Musik Karya Bot",
            embeds: [
              {
                title: "🎨 Karya Baru Masuk",
                description: `Satu karya baru telah disubmit dan menunggu verifikasi.`,
                color: 0x3b82f6,
                fields: [
                  { name: "Judul Karya", value: title, inline: false },
                  { name: "Pencipta / Penampil", value: creator, inline: true },
                  { name: "NIM Penanggung Jawab", value: nim, inline: true },
                  {
                    name: "Genre",
                    value: (genres || []).join(", ") || "-",
                    inline: true,
                  },
                  { name: "Platform", value: platform, inline: true },
                  { name: "Link", value: embedLink, inline: false },
                ],
                timestamp: new Date().toISOString(),
                footer: { text: "HIMA Musik Official Portal" },
              },
            ],
          },
          "Karya notification to Discord",
        );
      } catch (discordError) {
        console.error("Failed to send Discord notification:", discordError);
      }
    }

    // 3. Send confirmation email to respondent via Brevo
    if (email && email.trim() !== "" && email.includes("@")) {
      try {
        const htmlContent = generateKaryaEmailTemplate({
          title,
          creator,
          nim,
          platform,
          genres: Array.isArray(genres) ? genres.join(", ") : genres || "—",
          embedLink,
          status: "Masuk",
          submissionTime: new Date().toLocaleString("id-ID", {
            timeZone: "Asia/Jakarta",
            dateStyle: "long",
            timeStyle: "short",
          }),
        });

        await sendBrevoEmail({
          to: email,
          subject: `Salinan Pengajuan Karya HIMA: ${title}`,
          htmlContent,
        });
      } catch (emailError) {
        console.error(
          "[submit-karya] Failed to send confirmation email via Brevo:",
          emailError,
        );
        // Non-fatal: submission is still considered successful
      }
    }

    return NextResponse.json({ success: true, id: response.id });
  } catch (error) {
    console.error("Error submitting karya:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
