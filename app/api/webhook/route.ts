/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from "next/server";

import { supabaseAdmin } from "@/lib/supabase";

const DISCORD_EMBED_LIMIT = 4096;
const DISCORD_FIELD_LIMIT = 1024;
const DISCORD_CODE_BLOCK_LIMIT = 4084;
const INSTAGRAM_LOGO_URL =
  process.env.INSTAGRAM_LOGO_URL ??
  "https://cdn-icons-png.flaticon.com/512/174/174855.png";
const HIMA_INSTAGRAM_ID = process.env.HIMA_INSTAGRAM_ID;

const IDENTIFIER_ADJECTIVES = [
  "acoustic",
  "agile",
  "amber",
  "analog",
  "arcade",
  "azure",
  "bold",
  "bouncy",
  "brisk",
  "bright",
  "calm",
  "cedar",
  "clear",
  "cloudy",
  "cosmic",
  "crimson",
  "daring",
  "dusky",
  "electric",
  "faded",
  "fierce",
  "fluid",
  "gentle",
  "golden",
  "hollow",
  "honest",
  "ivory",
  "jolly",
  "kinetic",
  "lively",
  "lunar",
  "lush",
  "mellow",
  "minty",
  "neon",
  "nimble",
  "opal",
  "patient",
  "polished",
  "quick",
  "quiet",
  "radiant",
  "restless",
  "rosy",
  "silver",
  "sleepy",
  "solar",
  "steady",
  "tender",
  "tidy",
  "velvet",
  "vivid",
  "warm",
  "wild",
  "witty",
  "zesty",
];

const IDENTIFIER_NOUNS = [
  "amp",
  "anthem",
  "archive",
  "bassline",
  "beat",
  "bridge",
  "cadence",
  "chorus",
  "clef",
  "cymbal",
  "delay",
  "echo",
  "fader",
  "filter",
  "gain",
  "groove",
  "harmony",
  "hook",
  "jam",
  "kick",
  "lyric",
  "melody",
  "meter",
  "mixer",
  "motif",
  "octave",
  "pedal",
  "phrase",
  "pulse",
  "reverb",
  "riff",
  "scale",
  "signal",
  "snare",
  "spark",
  "stage",
  "studio",
  "tempo",
  "tone",
  "track",
  "tremolo",
  "verse",
  "vinyl",
  "vocal",
  "wave",
  "wire",
  "zine",
];

const FIELD_TITLES: Record<string, string> = {
  comments: "Instagram Comment",
  live_comments: "Instagram Live Comment",
  mentions: "Instagram Mention",
  message_edit: "Instagram Message Edited",
  message_reactions: "Instagram Message Reaction",
  messages: "Instagram DM",
  story_replies: "Instagram Story Reply",
  messaging_handover: "Instagram Messaging Handover",
  messaging_postbacks: "Instagram Postback",
  messaging_referral: "Instagram Referral",
  messaging_seen: "Instagram Seen",
  standby: "Instagram Standby",
  story_insights: "Instagram Story Insights",
};

const FIELD_COLORS: Record<string, number> = {
  comments: 0x833ab4,
  live_comments: 0xc13584,
  mentions: 0xf56040,
  message_edit: 0x5851db,
  message_reactions: 0xffdc80,
  messages: 0xe1306c,
  story_replies: 0xf56040,
  messaging_handover: 0x405de6,
  messaging_postbacks: 0x0099ff,
  messaging_referral: 0x00b894,
  messaging_seen: 0x2d3436,
  standby: 0x636e72,
  story_insights: 0xfd1d1d,
};

interface InstagramProfile {
  id: string;
  username?: string;
  name?: string;
  profile_pic?: string;
}

interface DiscordIdentity {
  username: string;
  avatarUrl: string;
}

interface WebhookContext {
  eventType: string;
  identifier: string;
  senderId?: string;
  senderProfile?: InstagramProfile | null;
  discordIdentity: DiscordIdentity;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!isInstagramWebhookPayload(body)) {
      return new Response("EVENT_RECEIVED", { status: 200 });
    }

    try {
      await processInstagramWebhook(body);
    } catch (error) {
      console.error("Failed to process Instagram webhook:", error);
    }

    return new Response("EVENT_RECEIVED", { status: 200 });
  } catch (error) {
    console.error("Error parsing request body:", error);
    return new Response("EVENT_RECEIVED", { status: 200 });
  }
}

async function processInstagramWebhook(body: any) {
  const entries = Array.isArray(body.entry) ? body.entry : [];

  for (const entry of entries) {
    const context = await getEntryContext(entry);

    try {
      await sendRawToDiscord(entry, context);
    } catch (error) {
      console.error("Failed to send raw Instagram webhook:", error);
    }

    const embeds = await buildEmbedsForEntry(entry, context);

    for (const embed of embeds) {
      try {
        await sendParsedToDiscord(embed);
      } catch (error) {
        console.error("Failed to send parsed Instagram webhook:", error);
      }
    }
  }
}

function isInstagramWebhookPayload(body: any) {
  if (body?.object === "instagram") return true;

  const entries = Array.isArray(body?.entry) ? body.entry : [];
  return entries.some(
    (entry) =>
      Array.isArray(entry?.messaging) ||
      Array.isArray(entry?.changes) ||
      Array.isArray(entry?.standby),
  );
}

async function fetchMediaBuffer(url: string): Promise<{
  buffer: Buffer;
  contentType: string;
  filename: string;
} | null> {
  if (!url || typeof url !== "string") return null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") || "image/jpeg";
    const arrayBuf = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    let ext = "jpg";
    if (contentType.includes("png")) ext = "png";
    else if (contentType.includes("gif")) ext = "gif";
    else if (contentType.includes("webp")) ext = "webp";
    else if (contentType.includes("mp4") || contentType.includes("video"))
      ext = "mp4";

    const filename = `media_${Date.now()}_${Math.floor(Math.random() * 1000)}.${ext}`;

    return { buffer, contentType, filename };
  } catch (err) {
    console.warn(
      "[Webhook] Failed to fetch media buffer from temporary Meta URL:",
      err,
    );
    return null;
  }
}

async function mirrorToSupabase(
  buffer: Buffer,
  filename: string,
  contentType: string,
): Promise<string | null> {
  if (!supabaseAdmin) return null;
  try {
    const bucketName =
      process.env.INSTAGRAM_ATTACHMENTS_BUCKET ||
      process.env.INSTAGRAM_SECRET_PAGE_BUCKET ||
      "instagram-secret-page";
    const storagePath = `instagram-webhook-media/${filename}`;

    const { error } = await supabaseAdmin.storage
      .from(bucketName)
      .upload(storagePath, buffer, {
        contentType,
        upsert: true,
      });

    if (error) {
      console.warn("[Supabase Storage] Failed to upload media:", error.message);
      return null;
    }

    const { data } = supabaseAdmin.storage
      .from(bucketName)
      .getPublicUrl(storagePath);

    return data?.publicUrl ?? null;
  } catch (err) {
    console.warn("[Supabase Storage] Mirror error:", err);
    return null;
  }
}

async function buildEmbedsForEntry(entry: any, context: WebhookContext) {
  return [
    ...(await buildMessagingEmbeds(entry, context)),
    ...buildChangeEmbeds(entry, context),
    ...buildStandbyEmbeds(entry, context),
  ];
}

async function buildMessagingEmbeds(entry: any, context: WebhookContext) {
  const messagingEvents = Array.isArray(entry.messaging) ? entry.messaging : [];
  const embeds: any[] = [];

  for (const event of messagingEvents) {
    const eventType = getMessagingEventType(event);
    const identifier = context.identifier;
    const himaSender = isHimaSender(entry, event);
    const himaId =
      HIMA_INSTAGRAM_ID || process.env.INSTAGRAM_ACCOUNT_ID || entry?.id;

    const senderId = himaSender ? himaId : event.sender?.id || context.senderId;

    const senderProfile =
      senderId === context.senderId && context.senderProfile
        ? context.senderProfile
        : await fetchInstagramProfile(senderId);

    const discordIdentity = getDiscordIdentity({
      profile: senderProfile,
      fallback: himaSender
        ? "HIMA Musik ISI Yogyakarta"
        : senderId || identifier,
      isHima: himaSender,
    });

    const attachments = getMessageAttachments(event.message);
    const storyReply = getStoryReply(event.message);
    const rawImageUrl = storyReply?.url
      ? storyReply.url
      : attachments.find(isDiscordImageAttachment)?.url;

    const files: Array<{
      buffer: Buffer;
      filename: string;
      contentType: string;
    }> = [];
    let imageEmbedUrl: string | undefined = undefined;
    let supabaseUrl: string | null = null;

    if (rawImageUrl) {
      const fetchedMedia = await fetchMediaBuffer(rawImageUrl);
      if (fetchedMedia) {
        files.push(fetchedMedia);
        imageEmbedUrl = `attachment://${fetchedMedia.filename}`;
        supabaseUrl = await mirrorToSupabase(
          fetchedMedia.buffer,
          fetchedMedia.filename,
          fetchedMedia.contentType,
        );
      } else {
        imageEmbedUrl = rawImageUrl;
      }
    }

    const title = himaSender
      ? formatHimaDiscordUsername(senderProfile)
      : discordIdentity.username;

    const readMid = event.read?.mid;
    const decodedReadMid = decodeMetaBase64(readMid);

    const fields = [
      formatField(
        "From",
        himaSender
          ? formatHimaDiscordUsername(senderProfile)
          : formatProfile(senderProfile, senderId, {
              includeId: true,
            }),
        true,
      ),
      formatField("Event", formatEventLabel(eventType), true),
      formatField("Time", formatDisplayTime(event.timestamp), true),
      formatField("Story", formatStoryReply(storyReply), true),
      formatField(
        "Read Message ID",
        decodedReadMid
          ? `\`${decodedReadMid}\`\n*(Raw: \`${readMid}\`)*`
          : readMid
            ? `\`${readMid}\``
            : null,
        false,
      ),
      formatField(
        "Attachments",
        formatAttachments(attachments, supabaseUrl),
        false,
      ),
    ].filter(Boolean) as Array<{
      name: string;
      value: string;
      inline?: boolean;
    }>;

    embeds.push({
      title,
      webhookUsername: discordIdentity.username,
      webhookAvatarUrl: discordIdentity.avatarUrl,
      description: getMessagingDescription(event, eventType),
      color: FIELD_COLORS[eventType] ?? 0xe1306c,
      thumbnail: discordIdentity.avatarUrl
        ? { url: discordIdentity.avatarUrl }
        : undefined,
      image: imageEmbedUrl ? { url: imageEmbedUrl } : undefined,
      fields,
      files,
      footer: {
        text: "Instagram webhook",
      },
    });
  }

  return embeds;
}

function buildChangeEmbeds(entry: any, context: WebhookContext) {
  const changes = Array.isArray(entry.changes) ? entry.changes : [];

  return changes.map((change) => {
    const value = change.value ?? {};
    const fieldName = change.field ?? "unknown";
    const identifier = context.identifier;

    return {
      title: identifier,
      webhookUsername: identifier,
      description: getChangeDescription(fieldName, value),
      color: FIELD_COLORS[fieldName] ?? 0x833ab4,
      fields: [
        formatField("Event", formatEventLabel(fieldName), true),
        ...buildChangeDetailFields(fieldName, value),
      ].filter(Boolean) as Array<{
        name: string;
        value: string;
        inline?: boolean;
      }>,
      footer: {
        text: "Instagram webhook",
      },
    };
  });
}

function buildStandbyEmbeds(entry: any, context: WebhookContext) {
  const standbyEvents = Array.isArray(entry.standby) ? entry.standby : [];

  return standbyEvents.map((event) => {
    const identifier = context.identifier;

    return {
      title: identifier,
      webhookUsername: identifier,
      description: "Standby channel event received.",
      color: FIELD_COLORS.standby,
      fields: [
        formatField("Event", "Standby", true),
        formatField("Time", formatDisplayTime(event.timestamp), true),
      ].filter(Boolean) as Array<{
        name: string;
        value: string;
        inline?: boolean;
      }>,
      footer: {
        text: "Instagram webhook",
      },
    };
  });
}

function getMessagingEventType(event: any) {
  if (event.message?.is_deleted) return "message_edit";
  if (event.message?.reply_to?.story || Boolean(getStoryReply(event.message)))
    return "story_replies";
  if (event.message) return "messages";
  if (event.reaction) return "message_reactions";
  if (event.read) return "messaging_seen";
  if (event.postback) return "messaging_postbacks";
  if (event.referral) return "messaging_referral";
  if (
    event.pass_thread_control ||
    event.take_thread_control ||
    event.request_thread_control
  ) {
    return "messaging_handover";
  }

  return "messages";
}

function getMessagingDescription(event: any, eventType: string) {
  const text = (
    event.message?.text ||
    event.message?.caption ||
    event.message?.quick_reply?.payload ||
    event.message?.quick_reply?.title ||
    ""
  ).trim();

  const attachmentsDesc = describeAttachments(event.message, {
    compact: false,
  });
  const reactionDesc = event.reaction
    ? `${event.reaction?.action ?? "reacted"} ${event.reaction?.emoji ?? event.reaction?.reaction ?? ""}`.trim()
    : "";

  const explicitContent = text || attachmentsDesc || reactionDesc;

  if (eventType === "messages") {
    return truncate(
      explicitContent || "Message received.",
      DISCORD_EMBED_LIMIT,
    );
  }

  if (eventType === "story_replies") {
    if (explicitContent) {
      return truncate(
        `💬 **Replied to your story:**\n>>> ${explicitContent}`,
        DISCORD_EMBED_LIMIT,
      );
    }
    return "💬 **Replied to your story** *(No text content provided)*";
  }

  if (eventType === "message_reactions") {
    return truncate(
      reactionDesc || "Message reaction received.",
      DISCORD_EMBED_LIMIT,
    );
  }

  if (eventType === "messaging_seen") {
    const rawMid = event.read?.mid;
    const decodedMid = decodeMetaBase64(rawMid);
    if (decodedMid) {
      return truncate(
        `👀 **User has read the message**\n> **Decoded MID:** \`${decodedMid}\``,
        DISCORD_EMBED_LIMIT,
      );
    }
    return "👀 **User has read the message**";
  }

  if (eventType === "messaging_postbacks") {
    return truncate(
      event.postback?.title || event.postback?.payload || "Postback received.",
      DISCORD_EMBED_LIMIT,
    );
  }

  if (eventType === "messaging_referral") {
    return truncate(
      event.referral?.ref || "Referral received.",
      DISCORD_EMBED_LIMIT,
    );
  }

  if (eventType === "messaging_handover") {
    return "Messaging handover event received.";
  }

  return truncate(
    explicitContent || "Messaging event received.",
    DISCORD_EMBED_LIMIT,
  );
}

function getChangeDescription(fieldName: string, value: any) {
  if (fieldName === "comments" || fieldName === "live_comments") {
    return truncate(
      value.text || "Comment event received.",
      DISCORD_EMBED_LIMIT,
    );
  }

  if (fieldName === "mentions") {
    return truncate(
      `Mention received. Media ID: ${value.media_id ?? "-"} | Comment ID: ${value.comment_id ?? "-"}`,
      DISCORD_EMBED_LIMIT,
    );
  }

  if (fieldName === "story_insights") {
    return truncate(
      `Story expired. Media ID: ${value.media_id ?? "-"}`,
      DISCORD_EMBED_LIMIT,
    );
  }

  return truncate(`${fieldName} event received.`, DISCORD_EMBED_LIMIT);
}

function buildChangeDetailFields(fieldName: string, value: any) {
  if (fieldName === "comments" || fieldName === "live_comments") {
    return [
      formatField("From", formatUser(value.from), true),
      formatField("Message", value.text, false),
      formatField(
        "Ad",
        [value.ad_title, value.ad_id].filter(Boolean).join(" | "),
        true,
      ),
    ].filter(Boolean);
  }

  if (fieldName === "mentions") {
    return [formatField("Media ID", value.media_id, true)].filter(Boolean);
  }

  if (fieldName === "story_insights") {
    return [
      formatField("Impressions", value.impressions, true),
      formatField("Reach", value.reach, true),
      formatField("Replies", value.replies, true),
    ].filter(Boolean);
  }

  return [];
}

function formatField(name: string, value: any, inline = false) {
  if (value === undefined || value === null || value === "") return null;

  return {
    name,
    value: truncate(String(value), DISCORD_FIELD_LIMIT),
    inline,
  };
}

function formatUser(user: any) {
  if (!user) return null;
  const username = user.username ? `@${user.username}` : null;
  return [username, user.name].filter(Boolean).join(" | ");
}

function decodeMetaBase64(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  if (!/^[A-Za-z0-9+/=_-]{16,}$/.test(value)) return null;
  try {
    const decoded = Buffer.from(value, "base64").toString("utf-8");
    if (
      decoded &&
      /^[\x20-\x7E]+$/.test(decoded) &&
      (decoded.includes(":") || decoded.includes("ig_"))
    ) {
      return decoded;
    }
  } catch {
    // ignore
  }
  return null;
}

function formatProfile(
  profile: any,
  fallbackId?: string,
  options: { includeId?: boolean } = {},
) {
  const { includeId = true } = options;

  if (profile) {
    const username = profile.username ? `@${profile.username}` : null;
    const parts = [
      username,
      profile.name,
      includeId && profile.id ? `ID: ${profile.id}` : null,
    ].filter(Boolean);
    if (parts.length > 0) return parts.join(" | ");
  }

  if (fallbackId && String(fallbackId).trim()) {
    const trimmed = String(fallbackId).trim();
    return /^\d+$/.test(trimmed) ? `ID: ${trimmed}` : trimmed;
  }

  return "Unknown Instagram user";
}

function describeAttachments(
  message: any,
  options: { compact?: boolean } = {},
) {
  const attachments = getMessageAttachments(message);
  if (!attachments.length) return null;

  if (options.compact && attachments.some(isDiscordImageAttachment)) {
    return "Sent a photo/media.";
  }

  return attachments
    .map((attachment) => {
      const type = attachment.type;
      if (type === "story_mention") return "🖼️ Story Mention";
      if (type === "ig_story") return "🖼️ Instagram Story";
      if (type === "image") return "📷 Photo";
      if (type === "video") return "📹 Video";
      if (type === "audio") return "🎙️ Voice Note";
      if (type === "sticker") return "🎨 Sticker";
      return `📎 ${type || "Attachment"}`;
    })
    .join("\n");
}

function getMessageAttachments(message: any) {
  const attachments = Array.isArray(message?.attachments)
    ? message.attachments
    : [];

  return attachments
    .map((attachment: any) => ({
      type: attachment.type ?? "attachment",
      url: attachment.payload?.url,
      postId: attachment.payload?.ig_post_media_id,
    }))
    .filter((attachment: any) => attachment.url || attachment.postId);
}

function formatAttachments(attachments: any[], supabaseUrl?: string | null) {
  const lines: string[] = [];

  if (attachments.length > 0) {
    attachments.forEach((attachment) => {
      const type = attachment.type;
      let label = `📎 ${type || "Attachment"}`;
      if (type === "story_mention") label = "🖼️ Story Mention";
      else if (type === "ig_story") label = "🖼️ Instagram Story";
      else if (type === "image") label = "📷 Photo Attachment";
      else if (type === "video") label = "📹 Video Attachment";
      else if (type === "audio") label = "🎙️ Voice Note";
      else if (type === "sticker") label = "🎨 Sticker";

      if (attachment.postId) {
        label += ` (Post ID: ${attachment.postId})`;
      }
      lines.push(`• ${label}`);
    });
  }

  if (supabaseUrl) {
    lines.push(`• [🔗 View Permanent Media Backup](${supabaseUrl})`);
  }

  return lines.length > 0 ? lines.join("\n") : null;
}

function getStoryReply(message: any) {
  const story = message?.reply_to?.story;
  if (story) {
    return {
      id: story.id,
      url: story.url,
    };
  }

  const storyAttachment = Array.isArray(message?.attachments)
    ? message.attachments.find(
        (att: any) =>
          att.type === "story_mention" ||
          att.type === "ig_story" ||
          Boolean(att.payload?.story),
      )
    : null;

  if (storyAttachment) {
    return {
      id: storyAttachment.payload?.story?.id || storyAttachment.payload?.id,
      url: storyAttachment.payload?.url || storyAttachment.payload?.story?.url,
    };
  }

  return null;
}

function formatStoryReply(story: any) {
  if (!story) return null;
  return story.id ? `ID: ${story.id}` : "Story";
}

function isDiscordImageUrl(url: string) {
  if (!url || typeof url !== "string") return false;
  return /\.(?:avif|gif|jpe?g|png|webp)(?:[?#].*)?$/i.test(url);
}

function isDiscordImageAttachment(attachment: any) {
  return (
    Boolean(attachment?.url) &&
    (attachment.type === "image" || isDiscordImageUrl(attachment.url))
  );
}

function stringifyRawPayload(value: any) {
  return JSON.stringify(value, null, 2);
}

function formatDisplayTime(timestamp: any) {
  if (!timestamp) return null;
  const date = new Date(Number(timestamp));
  if (Number.isNaN(date.getTime())) return String(timestamp);

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(date);
}

function formatEventLabel(eventType: string) {
  return FIELD_TITLES[eventType]?.replace("Instagram ", "") ?? eventType;
}

function truncate(value: string | null | undefined, maxLength: number) {
  if (!value) return value ?? "";
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

function createEventIdentifier(entry: any, event: any, eventType: string) {
  const basis = [
    entry?.id,
    eventType,
    event?.message?.mid,
    event?.read?.mid,
    event?.reaction?.mid,
    event?.sender?.id,
    event?.recipient?.id,
    event?.timestamp,
    event?.field,
    event?.value?.media_id,
    event?.value?.comment_id,
  ]
    .filter(Boolean)
    .join(":");
  const hash = hashString(basis || JSON.stringify(event));
  const adjective = IDENTIFIER_ADJECTIVES[hash % IDENTIFIER_ADJECTIVES.length];
  const noun =
    IDENTIFIER_NOUNS[
      Math.floor(hash / IDENTIFIER_ADJECTIVES.length) % IDENTIFIER_NOUNS.length
    ];
  return `${adjective}-${noun}`;
}

function hashString(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

async function fetchInstagramProfile(
  id: string,
): Promise<InstagramProfile | null> {
  if (!id || !process.env.INSTAGRAM_ACCESS_TOKEN) return null;

  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  const fields = "id,username,name,profile_pic,profile_picture_url";

  let profile: InstagramProfile | null = null;

  // 1. Try graph.facebook.com (standard for Instagram Messaging IGSID profile lookup)
  try {
    const fbRes = await fetch(
      `https://graph.facebook.com/v25.0/${id}?fields=${fields}&access_token=${token}`,
    );
    if (fbRes.ok) {
      const data = await fbRes.json();
      if (
        data &&
        (data.username ||
          data.name ||
          data.profile_pic ||
          data.profile_picture_url)
      ) {
        profile = {
          id: data.id || id,
          username: data.username,
          name: data.name,
          profile_pic: data.profile_pic || data.profile_picture_url,
        };
      }
    }
  } catch {
    // Ignore and try fallback
  }

  // 2. Fallback to graph.instagram.com if not fetched
  if (!profile) {
    try {
      const igRes = await fetch(
        `https://graph.instagram.com/v25.0/${id}?fields=${fields}&access_token=${token}`,
      );
      if (igRes.ok) {
        const data = await igRes.json();
        if (
          data &&
          (data.username ||
            data.name ||
            data.profile_pic ||
            data.profile_picture_url)
        ) {
          profile = {
            id: data.id || id,
            username: data.username,
            name: data.name,
            profile_pic: data.profile_pic || data.profile_picture_url,
          };
        }
      }
    } catch (error) {
      console.error("Failed to fetch Instagram profile:", error);
    }
  }

  // 3. Direct Graph API picture endpoint query if profile_pic missing
  if (!profile) {
    profile = { id };
  }

  if (!profile.profile_pic) {
    try {
      const picRes = await fetch(
        `https://graph.facebook.com/v25.0/${id}/picture?type=large&redirect=0&access_token=${token}`,
      );
      if (picRes.ok) {
        const picData = await picRes.json();
        if (picData?.data?.url) {
          profile.profile_pic = picData.data.url;
        }
      }
    } catch {
      // Ignore
    }
  }

  // 4. Mirror temporary avatar URL to Supabase Storage for permanent caching
  if (profile?.profile_pic && supabaseAdmin) {
    try {
      const avatarMedia = await fetchMediaBuffer(profile.profile_pic);
      if (avatarMedia) {
        const ext = avatarMedia.contentType.includes("png") ? "png" : "jpg";
        const permanentAvatarUrl = await mirrorToSupabase(
          avatarMedia.buffer,
          `avatar_${id}_${Date.now()}.${ext}`,
          avatarMedia.contentType,
        );
        if (permanentAvatarUrl) {
          profile.profile_pic = permanentAvatarUrl;
        }
      }
    } catch {
      // Use raw profile_pic if mirroring fails
    }
  }

  return profile;
}

async function getEntryContext(entry: any): Promise<WebhookContext> {
  const primaryEvent = getPrimaryEvent(entry);
  const eventType = primaryEvent
    ? getEventType(primaryEvent)
    : entry?.changes?.[0]?.field || "instagram";
  const identifier = createEventIdentifier(
    entry,
    primaryEvent ?? entry,
    eventType,
  );
  const himaSender = isHimaSender(entry, primaryEvent);
  const himaId =
    HIMA_INSTAGRAM_ID || process.env.INSTAGRAM_ACCOUNT_ID || entry?.id;
  const senderId = himaSender
    ? himaId || primaryEvent?.sender?.id
    : primaryEvent?.sender?.id || entry?.changes?.[0]?.value?.from?.id;

  const senderProfile = await fetchInstagramProfile(senderId);
  const discordIdentity = getDiscordIdentity({
    profile: senderProfile,
    fallback: himaSender ? "HIMA Musik ISI Yogyakarta" : senderId || identifier,
    isHima: himaSender,
  });

  return {
    eventType,
    identifier,
    senderId,
    senderProfile,
    discordIdentity,
  };
}

function getPrimaryEvent(entry: any) {
  if (Array.isArray(entry.messaging) && entry.messaging[0]) {
    return entry.messaging[0];
  }

  if (Array.isArray(entry.changes) && entry.changes[0]) {
    return entry.changes[0];
  }

  if (Array.isArray(entry.standby) && entry.standby[0]) {
    return entry.standby[0];
  }

  return null;
}

function getEventType(event: any) {
  if (event?.field) return event.field;
  return getMessagingEventType(event);
}

function isHimaSender(entry: any, event: any) {
  const senderId = event?.sender?.id;
  if (!senderId) return false;

  return [entry?.id, process.env.INSTAGRAM_ACCOUNT_ID, HIMA_INSTAGRAM_ID]
    .filter(Boolean)
    .includes(senderId);
}

async function sendRawToDiscord(entry: any, context: WebhookContext) {
  const webhookUrl = process.env.DISCORD_ERROR_WEBHOOK_URL;

  if (!webhookUrl) {
    console.warn("DISCORD_ERROR_WEBHOOK_URL is not configured.");
    return;
  }

  const rawPayload = stringifyRawPayload(entry);

  for (const chunk of chunkForDiscord(rawPayload, DISCORD_CODE_BLOCK_LIMIT)) {
    await sendDiscordPayload(webhookUrl, {
      username: context.discordIdentity.username,
      avatar_url: context.discordIdentity.avatarUrl,
      embeds: [
        {
          title: context.identifier,
          description: `\`\`\`json\n${chunk}\n\`\`\``,
          color: FIELD_COLORS[context.eventType] ?? 0x5865f2,
          timestamp: new Date().toISOString(),
          footer: {
            text: formatProfile(context.senderProfile, "", {
              includeId: false,
            }),
          },
        },
      ],
    });
  }
}

async function sendParsedToDiscord(embed: any) {
  const webhookUrl = process.env.DISCORD_INSTAGRAM_WEBHOOK_URL;

  if (!webhookUrl) {
    console.warn("DISCORD_INSTAGRAM_WEBHOOK_URL is not configured.");
    return;
  }

  const { webhookUsername, webhookAvatarUrl, files, ...discordEmbed } = embed;

  await sendDiscordPayload(
    webhookUrl,
    {
      username: webhookUsername ?? embed.title,
      avatar_url: webhookAvatarUrl ?? INSTAGRAM_LOGO_URL,
      embeds: [
        {
          ...discordEmbed,
          timestamp: new Date().toISOString(),
        },
      ],
    },
    files,
  );
}

function formatDiscordUsername(profile: any, fallback?: string) {
  if (profile?.username) return `@${profile.username}`;
  if (profile?.name) return profile.name;
  if (fallback && String(fallback).trim()) {
    const trimmed = String(fallback).trim();
    return /^\d+$/.test(trimmed) ? `ID: ${trimmed}` : trimmed;
  }
  return "Instagram Account";
}

function getDiscordIdentity({
  profile,
  fallback,
  isHima,
}: {
  profile: any;
  fallback: string;
  isHima: boolean;
}): DiscordIdentity {
  if (isHima) {
    return {
      username: formatHimaDiscordUsername(profile),
      avatarUrl: profile?.profile_pic ?? INSTAGRAM_LOGO_URL,
    };
  }

  return {
    username: formatDiscordUsername(profile, fallback),
    avatarUrl: profile?.profile_pic ?? INSTAGRAM_LOGO_URL,
  };
}

function formatHimaDiscordUsername(profile: any) {
  if (profile?.username) return `@${profile.username}`;
  if (profile?.name) return profile.name;
  return "HIMA Musik ISI Yogyakarta";
}

async function sendDiscordPayload(
  webhookUrl: string,
  payload: any,
  files?: Array<{ buffer: Buffer; filename: string; contentType?: string }>,
) {
  if (files && files.length > 0) {
    const formData = new FormData();
    formData.append("payload_json", JSON.stringify(payload));
    files.forEach((file, index) => {
      const blob = new Blob([file.buffer], {
        type: file.contentType || "image/jpeg",
      });
      formData.append(`files[${index}]`, blob, file.filename);
    });

    const response = await fetch(webhookUrl, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const responseBody = await response.text();
      throw new Error(
        `Discord webhook failed: ${response.status} ${responseBody}`,
      );
    }
    return;
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(
      `Discord webhook failed: ${response.status} ${responseBody}`,
    );
  }
}

function chunkForDiscord(value: string, maxLength: number) {
  if (value.length <= maxLength) return [value];

  const chunks: string[] = [];
  for (let index = 0; index < value.length; index += maxLength) {
    chunks.push(value.slice(index, index + maxLength));
  }

  return chunks;
}
