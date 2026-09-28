import { NextRequest, NextResponse } from "next/server";

import { safeEqual } from "@/lib/api-auth";
import { sendDiscordWebhook } from "@/lib/discord";
import { NOTION_API_VERSION } from "@/lib/glossarium";
import { getCalendar } from "@/lib/googleCalendar";

async function resolveDiscordTags(items: any[]): Promise<string[]> {
  const tags: string[] = [];
  for (const item of items) {
    let targetId = null;
    if (item.type === "mention" && item.mention) {
      targetId =
        item.mention.page?.id ||
        item.mention.database?.id ||
        item.mention.user?.id;
    } else if (item.id) {
      targetId = item.id;
    }

    if (!targetId) continue;

    const res = await fetch(`https://api.notion.com/v1/pages/${targetId}`, {
      headers: {
        Authorization: `Bearer ${process.env.NOTION_INTEGRATION_TOKEN}`,
        "Notion-Version": NOTION_API_VERSION,
      },
    });
    const page = await res.json();

    const discordProp =
      page.properties?.["Discord ID"]?.rich_text?.[0]?.plain_text ??
      page.properties?.["Discord"]?.rich_text?.[0]?.plain_text ??
      null;

    if (discordProp) {
      tags.push(`<@${discordProp}>`);
    } else {
      const nameProp =
        page.properties?.["Name"]?.title?.[0]?.plain_text ??
        page.properties?.["Nama"]?.title?.[0]?.plain_text ??
        "";
      if (nameProp) tags.push(`**${nameProp}**`);
    }
  }
  return tags;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const challenge = searchParams.get("challenge");

  if (challenge) {
    return NextResponse.json({ challenge });
  }

  return NextResponse.json({ ok: true });
}

async function resolveAttendeeEmails(items: any[]): Promise<string[]> {
  const emails: string[] = [];
  for (const item of items) {
    let targetId = null;
    if (item.type === "mention" && item.mention) {
      targetId =
        item.mention.page?.id ||
        item.mention.database?.id ||
        item.mention.user?.id;
    } else if (item.id) {
      targetId = item.id;
    }

    if (!targetId) continue;

    const res = await fetch(`https://api.notion.com/v1/pages/${targetId}`, {
      headers: {
        Authorization: `Bearer ${process.env.NOTION_INTEGRATION_TOKEN}`,
        "Notion-Version": NOTION_API_VERSION,
      },
    });
    const page = await res.json();

    // In CMS SDM, the exact property name is "Email" with type "email"
    const emailProp =
      page.properties?.["Email"]?.email ??
      page.properties?.["Email"]?.rich_text?.[0]?.plain_text ??
      page.properties?.["Email Aktif"]?.email ??
      page.properties?.["Email Aktif"]?.rich_text?.[0]?.plain_text ??
      null;

    if (emailProp && emailProp.includes("@")) {
      emails.push(emailProp);
    }
  }
  return emails;
}

async function updateNotionCalendarId(pageId: string, eventId: string) {
  await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${process.env.NOTION_INTEGRATION_TOKEN}`,
      "Notion-Version": NOTION_API_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: {
        "Calendar Event ID": {
          rich_text: [{ text: { content: eventId } }],
        },
      },
    }),
  });
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  const xAction = req.headers.get("x-action");

  // Step 1: Auth validation (constant-time compare to avoid leaking tokens)
  const expectedToken = process.env.NOTION_WEBHOOK_VERIFICATION_TOKEN;
  if (!authHeader || !expectedToken || !safeEqual(authHeader, expectedToken)) {
    console.error(
      "[Notion Calendar Webhook] Unauthorized! Missing/invalid token",
    );
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let namaEvent = "";

  try {
    const body = await req.json();

    // Step 3: Parse Notion payload
    const props = body.data?.properties || {};
    const pageId = body.data?.id;

    if (!pageId) {
      return NextResponse.json({ error: "No page ID found" }, { status: 400 });
    }

    if (xAction === "notify") {
      const isRapat = !!props["Agenda Utama"];
      const isTugas = !!props["Nama Tugas"] || !!props["Task"];

      let title = "";
      let desc = "";
      let mentions: any[] = [];
      let label = "";

      if (isRapat) {
        title = props["Agenda Utama"]?.title?.[0]?.plain_text ?? "Rapat Baru";
        const jadwal = props["Jadwal"]?.date?.start ?? "Belum ditentukan";
        const lokasi =
          props["Lokasi Pertemuan"]?.rich_text?.[0]?.plain_text ??
          "Belum ditentukan";
        mentions =
          props["(AUT) Daftar Undangan"]?.rich_text ??
          props["(AUT) Daftar Undangan"]?.relation ??
          [];
        label = "📅 **Undangan Rapat**";
        desc = `**Jadwal:** ${jadwal}\n**Lokasi:** ${lokasi}`;
      } else if (isTugas) {
        title =
          props["Nama Tugas"]?.title?.[0]?.plain_text ??
          props["Task"]?.title?.[0]?.plain_text ??
          "Tugas Baru";
        const deadline =
          props["Deadline"]?.date?.start ??
          props["Tenggat Waktu"]?.date?.start ??
          "Belum ditentukan";
        const status =
          props["Status"]?.status?.name ??
          props["Status"]?.select?.name ??
          "To Do";
        mentions =
          props["PIC"]?.relation ??
          props["Ditugaskan"]?.relation ??
          props["Assignee"]?.relation ??
          [];
        label = "📋 **Tugas Baru**";
        desc = `**Deadline:** ${deadline}\n**Status:** ${status}`;
      } else {
        return NextResponse.json(
          { error: "Unknown database type" },
          { status: 400 },
        );
      }

      const tags = await resolveDiscordTags(mentions);
      const mentionsText =
        tags.length > 0 ? `\n**Tag:** ${tags.join(" ")}` : "";

      const webhookUrl = process.env.DISCORD_TUGAS_RAPAT_WEBHOOK_URL;

      await sendDiscordWebhook(
        webhookUrl,
        {
          content: tags.length > 0 ? tags.join(" ") : undefined,
          embeds: [
            {
              title: `${label}: ${title}`,
              description: `${desc}${mentionsText}`,
              color: isRapat ? 0x3498db : 0xe67e22,
              timestamp: new Date().toISOString(),
            },
          ],
        },
        "Notion Task/Meeting Notif",
      );

      return NextResponse.json({ success: true });
    }

    namaEvent = props["Agenda Utama"]?.title?.[0]?.plain_text ?? "";
    const jadwal = props["Jadwal"]?.date;
    const lokasi = props["Lokasi Pertemuan"]?.rich_text?.[0]?.plain_text ?? "";
    const calId = props["Calendar Event ID"]?.rich_text?.[0]?.plain_text ?? "";
    const undangan =
      props["(AUT) Daftar Undangan"]?.rich_text ??
      props["(AUT) Daftar Undangan"]?.relation ??
      [];

    const startDateTime = jadwal?.start;
    if (!startDateTime) {
      return NextResponse.json({ error: "Jadwal kosong" }, { status: 400 });
    }
    const endDateTime = jadwal?.end ?? jadwal?.start;

    // Step 4 & 5: Build event payload
    const attendeeEmails = await resolveAttendeeEmails(undangan);
    const attendees = attendeeEmails.map((email) => ({ email }));

    const eventBody = {
      summary: namaEvent,
      location: lokasi || undefined,
      start: { dateTime: startDateTime, timeZone: "Asia/Jakarta" },
      end: { dateTime: endDateTime, timeZone: "Asia/Jakarta" },
      attendees,
      sendUpdates: "all" as const,
    };

    const calendarId = process.env.GOOGLE_CALENDAR_ID;
    if (!calendarId) {
      console.error(
        "[Notion Calendar Webhook] ERROR: GOOGLE_CALENDAR_ID environment variable not set",
      );
      throw new Error("GOOGLE_CALENDAR_ID environment variable not set");
    }

    // Step 6: Route by x-action
    if (xAction === "update") {
      if (!calId) {
        // CREATE
        const calendar = getCalendar();
        const res = await calendar.events.insert({
          calendarId,
          requestBody: eventBody,
        });
        if (res.data.id) {
          await updateNotionCalendarId(pageId, res.data.id);
        }
      } else {
        // UPDATE
        const calendar = getCalendar();
        await calendar.events.patch({
          calendarId,
          eventId: calId,
          requestBody: eventBody,
        });
      }
    } else if (xAction === "delete") {
      if (!calId) {
        return NextResponse.json(
          {
            error:
              "Calendar Event ID tidak ditemukan. Sync dulu sebelum delete.",
          },
          { status: 400 },
        );
      }
      // DELETE
      const calendar = getCalendar();
      await calendar.events.delete({
        calendarId,
        eventId: calId,
      });
      await updateNotionCalendarId(pageId, "");
    } else {
      return NextResponse.json(
        { error: "x-action tidak dikenal" },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    // Step 8: Error handling
    console.error("Google Calendar API error:", err);

    if (process.env.DISCORD_ERROR_WEBHOOK_URL) {
      await fetch(process.env.DISCORD_ERROR_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: `❌ **Google Calendar error** [${xAction}] pada *${namaEvent}*\n\`\`\`${err.message}\`\`\``,
        }),
      });
    }

    return NextResponse.json(
      { error: "Google Calendar API gagal", detail: err.message },
      { status: 500 },
    );
  }
}
