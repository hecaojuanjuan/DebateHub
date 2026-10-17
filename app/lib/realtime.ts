import { DurableObject, env } from "cloudflare:workers";
import { ApiError } from "./server";
import { stateContext } from "./state";

// Only invalidation signals travel over this channel. Every data request is
// authorized again, including after removal, logout, or a visibility change.
export class CommunityHub extends DurableObject {
  constructor(ctx: DurableObjectState, bindings: Cloudflare.Env) {
    super(ctx, bindings);
    ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong"),
    );
  }

  async fetch(request: Request) {
    if (request.method === "POST") {
      if ((await this.ctx.storage.getAlarm()) === null)
        await this.ctx.storage.setAlarm(Date.now() + 300);
      return new Response(null, { status: 204 });
    }
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
      return new Response(null, { status: 426 });
    if (this.ctx.getWebSockets().length >= 2000)
      return new Response(null, { status: 503 });
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].send("ready");
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async alarm() {
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send("invalidate");
      } catch {
        socket.close(1011, "Reconnect");
      }
    }
  }

  webSocketMessage(socket: WebSocket) {
    // Clients cannot publish events or inject forum data into other sessions.
    socket.close(1008, "Read-only channel");
  }

  webSocketClose(socket: WebSocket) {
    // Abnormal disconnects use reserved codes such as 1006, which cannot be
    // passed back to close(). The runtime may already have closed this peer.
    try {
      socket.close(1000);
    } catch {
      /* Already closed. */
    }
  }

  webSocketError(socket: WebSocket) {
    socket.close(1011, "Reconnect");
  }
}

export async function connectRealtime(request: Request) {
  try {
    if (
      request.method !== "GET" ||
      request.headers.get("Upgrade")?.toLowerCase() !== "websocket"
    )
      return new Response(null, { status: 426 });
    if (request.headers.get("Origin") !== new URL(request.url).origin)
      throw new ApiError(403, "连接来源无效");
    const cid = new URL(request.url).searchParams.get("community") || "unnc";
    const context = await stateContext(request, cid);
    if (!context.role && context.visibility !== "public")
      throw new ApiError(403, "请先加入社区");
    if (!env.COMMUNITY_HUB) throw new ApiError(503, "实时连接暂不可用");
    return env.COMMUNITY_HUB.getByName(cid).fetch(request);
  } catch (error) {
    return Response.json(
      { error: error instanceof ApiError ? error.message : "连接暂不可用" },
      { status: error instanceof ApiError ? error.status : 503 },
    );
  }
}

export async function publishChange(cid: string) {
  if (!env.COMMUNITY_HUB) return;
  try {
    const response = await env.COMMUNITY_HUB.getByName(cid).fetch(
      "https://community-hub/invalidate",
      { method: "POST" },
    );
    if (!response.ok) throw new Error(`Hub status ${response.status}`);
  } catch {
    // A notification failure must not report a committed write as failed.
    // Clients reconcile periodically and after reconnection.
    console.error("Community notification unavailable");
  }
}
