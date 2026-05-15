import { currentUser } from "@clerk/nextjs/server";
import { StreamClient } from "@stream-io/node-sdk";
import { db } from "@/lib/prisma";

const escapeHtml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const formatOffset = (milliseconds = 0) => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

const getLatestByStartTime = (items = []) => {
  return [...items]
    .filter((item) => item?.url)
    .sort((a, b) => new Date(b.start_time) - new Date(a.start_time))[0];
};

const parseJsonlTranscript = (text) => {
  return text
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((entry) => entry?.type === "speech" && entry.text);
};

const renderTranscriptHtml = ({ booking, entries }) => {
  const speakerMap = {
    [booking.interviewer.clerkUserId]: booking.interviewer.name ?? "Interviewer",
    [booking.interviewee.clerkUserId]: booking.interviewee.name ?? "Interviewee",
  };

  const rows = entries
    .map((entry) => {
      const speaker = speakerMap[entry.speaker_id] ?? "Participant";
      return `
        <div class="entry">
          <div class="meta">
            <span>${escapeHtml(formatOffset(entry.start_ts))}</span>
            <strong>${escapeHtml(speaker)}</strong>
          </div>
          <p>${escapeHtml(entry.text)}</p>
        </div>
      `;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Session Transcript</title>
    <style>
      :root {
        color-scheme: dark;
        background: #0a0a0b;
        color: #e7e5e4;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      body {
        margin: 0;
        background: #0a0a0b;
      }
      main {
        max-width: 920px;
        margin: 0 auto;
        padding: 40px 20px 56px;
      }
      header {
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        padding-bottom: 22px;
        margin-bottom: 24px;
      }
      .eyebrow {
        color: #fbbf24;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }
      h1 {
        margin: 8px 0 8px;
        font-size: clamp(28px, 5vw, 44px);
        line-height: 1.05;
        font-weight: 600;
      }
      .subtle {
        color: #a8a29e;
        font-size: 14px;
        line-height: 1.6;
        margin: 0;
      }
      .entries {
        display: grid;
        gap: 12px;
      }
      .entry {
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: #0f0f11;
        border-radius: 10px;
        padding: 16px;
      }
      .meta {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 8px;
        color: #a8a29e;
        font-size: 12px;
      }
      .meta span {
        color: #fbbf24;
        font-variant-numeric: tabular-nums;
      }
      .meta strong {
        color: #e7e5e4;
      }
      p {
        margin: 0;
        color: #d6d3d1;
        font-size: 15px;
        line-height: 1.7;
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <div class="eyebrow">Transcript</div>
        <h1>${escapeHtml(booking.interviewer.name ?? "Interviewer")} / ${escapeHtml(
    booking.interviewee.name ?? "Interviewee"
  )}</h1>
        <p class="subtle">Readable transcript generated from the Stream transcription file.</p>
      </header>
      <section class="entries">
        ${rows || '<p class="subtle">No speech was found in this transcript.</p>'}
      </section>
    </main>
  </body>
</html>`;
};

export async function GET(_request, context) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { bookingId } = await context.params;

  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      interviewer: {
        select: { clerkUserId: true, name: true },
      },
      interviewee: {
        select: { clerkUserId: true, name: true },
      },
    },
  });

  if (!booking?.streamCallId) {
    return new Response("Transcript not found", { status: 404 });
  }

  const isParticipant =
    booking.interviewer.clerkUserId === user.id ||
    booking.interviewee.clerkUserId === user.id;

  if (!isParticipant) return new Response("Forbidden", { status: 403 });

  const streamClient = new StreamClient(
    process.env.NEXT_PUBLIC_STREAM_API_KEY,
    process.env.STREAM_SECRET_KEY
  );
  const call = streamClient.video.call("default", booking.streamCallId);
  const transcriptionsResponse = await call.listTranscriptions();
  const latestTranscription = getLatestByStartTime(
    transcriptionsResponse.transcriptions
  );

  if (!latestTranscription?.url) {
    return new Response("Transcript not found", { status: 404 });
  }

  const transcriptResponse = await fetch(latestTranscription.url);
  if (!transcriptResponse.ok) {
    return new Response("Failed to load transcript", { status: 502 });
  }

  const transcriptText = await transcriptResponse.text();
  const entries = parseJsonlTranscript(transcriptText);

  return new Response(renderTranscriptHtml({ booking, entries }), {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
