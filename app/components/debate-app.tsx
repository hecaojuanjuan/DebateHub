"use client";

import { useLanguage, LanguageSwitcher } from "./language-provider";
import { LocalizedForm } from "./localized-form";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Globe2,
  Hash,
  LayoutGrid,
  LockKeyhole,
  LogOut,
  MessageCircle,
  MessageSquareQuote,
  Plus,
  Radio,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import type {
  Comment,
  Side,
  State,
  Member,
  JoinRequest,
  CommunityLink,
} from "@/lib/types";
import CommunityModals, { type ModalName } from "./community-modals";
import { useCommunitySync } from "./use-community-sync";

export default function DebateApp({
  communityId = "unnc",
}: {
  communityId?: string;
}) {
  const [data, setData] = useState<State | null>(null);
  const {
    t,
    locale,
    errorText,
    formatTime,
    formatDate,
    communityName,
    communityDescription,
  } = useLanguage();
  const displayName = communityName(data?.community.name, communityId);
  const sideName = (side: Side) => t(side === "pro" ? "Pro" : "Con");
  useEffect(() => {
    document.title = `DebateHub · ${displayName}`;
  }, [displayName]);
  const [selectedTopic, setSelectedTopic] = useState("");
  const [view, setView] = useState<"discussion" | "topics">("discussion");
  const [modal, setModal] = useState<ModalName>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  useEffect(() => setToast(""), [locale]);
  const [invite, setInvite] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [filter, setFilter] = useState<"all" | Side>("all");
  const [sort, setSort] = useState("newest");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [anonymousVote, setAnonymousVote] = useState(false);
  const [reply, setReply] = useState<Comment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [requests, setRequests] = useState<JoinRequest[] | null>(null);
  const [communities, setCommunities] = useState<CommunityLink[] | null>(null);
  const mutationLock = useRef(false);
  const composer = useRef<HTMLTextAreaElement>(null);
  const { refresh, online, error } = useCommunitySync(
    communityId,
    selectedTopic,
    data?.viewer?.id ?? "",
    !!data?.accessible,
    setData,
  );
  useEffect(() => {
    setAnonymousVote(data?.mySide ? data.myVoteAnonymous : false);
  }, [data?.topic?.id, data?.mySide, data?.myVoteAnonymous]);
  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const setup = fragment.get("setup");
    if (setup) {
      setSetupToken(setup);
      setModal("account");
      history.replaceState(null, "", location.pathname + location.search);
      return;
    }
    const token = fragment.get("invite");
    if (token) {
      setInvite(token);
      setModal("join");
    }
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  const roster = useRef<{ tag: string; running: Promise<void> | null }>({
    tag: "",
    running: null,
  });
  const loadMembers = useCallback(async () => {
    const cache = roster.current;
    if (cache.running) return cache.running;
    cache.running = (async () => {
      const response = await fetch(
        `/api/members?community=${encodeURIComponent(communityId)}`,
        {
          cache: "no-store",
          signal: AbortSignal.timeout(15_000),
          headers: cache.tag ? { "If-None-Match": cache.tag } : {},
        },
      );
      if (response.status === 304) return;
      const result = (await response.json()) as {
        members: Member[];
        requests: JoinRequest[];
        error?: string;
      };
      if (!response.ok) {
        cache.tag = "";
        setMembers(null);
        setRequests(null);
        throw new Error(result.error);
      }
      cache.tag = response.headers.get("ETag") || "";
      setMembers(result.members);
      setRequests(result.requests);
    })().finally(() => {
      cache.running = null;
    });
    return cache.running;
  }, [communityId]);
  useEffect(() => {
    if (modal === "members") {
      roster.current.tag = "";
      setMembers(null);
      void loadMembers().catch((e) => setToast(e.message));
      const timer = setInterval(() => {
        if (!document.hidden)
          void loadMembers().catch((e) => setToast(e.message));
      }, 15000);
      return () => clearInterval(timer);
    }
    if (modal === "switch") {
      setCommunities(null);
      void fetch("/api/communities", { cache: "no-store" })
        .then(async (response) => {
          const result = (await response.json()) as {
            communities: CommunityLink[];
            error?: string;
          };
          if (!response.ok) throw new Error(result.error);
          setCommunities(result.communities);
        })
        .catch((e) => setToast(e.message));
    }
  }, [modal, loadMembers]);
  useEffect(() => {
    if (modal === "members")
      void loadMembers().catch((e) => setToast(e.message));
  }, [data, modal, loadMembers]);
  function perform(
    path: string,
    body: Record<string, unknown>,
    done?: (result: Record<string, any>) => void,
  ) {
    if (mutationLock.current) return;
    mutationLock.current = true;
    setBusy(true);
    void (async () => {
      try {
        const response = await fetch(`/api/${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, communityId }),
        });
        const result = (await response.json()) as Record<string, any>;
        if (!response.ok)
          throw new Error(
            result.error || t("Something went wrong. Please try again."),
          );
        done?.(result);
        if (
          path === "join" ||
          path === "auth/register" ||
          (path === "auth/login" && result.joined)
        )
          setInvite("");
        if (path === "invites/revoke") setInviteUrl("");
        if (["members/role", "members/review", "members/remove"].includes(path))
          await loadMembers();
        await refresh();
      } catch (e) {
        setToast(
          e instanceof Error
            ? e.message
            : t("Something went wrong. Please try again."),
        );
      } finally {
        mutationLock.current = false;
        setBusy(false);
      }
    })();
  }
  const isAdmin = ["owner", "admin"].includes(data?.viewer?.role ?? "");
  const joined = !!data?.viewer?.role;
  useEffect(() => {
    if (modal === "members" && !isAdmin) setModal(null);
  }, [modal, isAdmin]);
  useEffect(() => {
    if (
      selectedTopic &&
      data &&
      !data.topics.some((t) => t.id === selectedTopic)
    )
      setSelectedTopic("");
  }, [data, selectedTopic]);
  const topic = data?.topic;
  const total = (data?.stats.pro ?? 0) + (data?.stats.con ?? 0);
  const proPercent = total ? Math.round((data!.stats.pro / total) * 100) : 0;
  const commentCount = data?.comments.filter((c) => !c.deleted).length ?? 0;
  const changeTopic = (id: string) => {
    setSelectedTopic(id);
    setDraft("");
    setReply(null);
    setFilter("all");
    setView("discussion");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const vote = (side: Side) => {
    if (!joined) {
      setModal("join");
      return;
    }
    perform(
      "votes",
      { topicId: topic?.id, side, anonymous: anonymousVote },
      () =>
        setToast(
          t("Voted {side} ({privacy}).", {
            side: sideName(side),
            privacy: anonymousVote ? t("anonymously") : t("with your nickname"),
          }),
        ),
    );
  };
  const changeVotePrivacy = (checked: boolean) => {
    if (!joined) {
      setModal("join");
      return;
    }
    if (!data?.mySide) {
      setAnonymousVote(checked);
      return;
    }
    perform(
      "votes",
      { topicId: topic?.id, side: data.mySide, anonymous: checked },
      () => {
        setAnonymousVote(checked);
        setToast(
          checked
            ? t("Your vote is now anonymous.")
            : t("Your vote now shows your nickname."),
        );
      },
    );
  };
  const openInvite = () => {
    setInviteUrl("");
    setModal("invite");
    perform("invites/create", {}, (result) =>
      setInviteUrl(
        `${window.location.origin}/c/${communityId}#invite=${result.token}`,
      ),
    );
  };
  const renderComment = (c: Comment, nested = false) => (
    <article className={`comment ${nested ? "nested" : ""}`} key={c.id}>
      <div className={`avatar ${c.side}`}>
        {c.anonymous
          ? t("Anonymous contributor").slice(0, 1)
          : c.nickname.slice(0, 1)}
      </div>
      <div className="comment-main">
        <div className="comment-byline">
          <strong>
            {c.anonymous ? t("Anonymous contributor") : c.nickname}
          </strong>
          {c.isMine && <span className="mine-label">{t("You")}</span>}
          <span className={`side-label ${c.side}`}>{sideName(c.side)}</span>
          <time title={t("Times are shown in Beijing time (UTC+8)")}>
            {formatTime(c.createdAt)}
          </time>
        </div>
        <p className={c.deleted ? "deleted" : ""}>
          {c.deleted ? t("This post has been removed.") : c.content}
        </p>
        {!c.deleted && (
          <div className="comment-actions">
            <button
              onClick={() => {
                if (!joined) {
                  setModal("join");
                  return;
                }
                setReply(c);
                composer.current?.focus();
              }}
              disabled={topic?.withdrawn || topic?.status === "closed"}
            >
              <MessageCircle size={14} />
              {t("Reply")}
            </button>
            {(isAdmin || c.isMine) && (
              <button onClick={() => setDeleteTarget(c.id)}>
                <Trash2 size={13} />
                {t("Remove")}
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
  const threads = useMemo(() => {
    const roots: Comment[] = [];
    const replies = new Map<string, Comment[]>();
    for (const comment of data?.comments ?? []) {
      if (!comment.parentId) roots.push(comment);
      else {
        const list = replies.get(comment.parentId) ?? [];
        list.push(comment);
        replies.set(comment.parentId, list);
      }
    }
    const visible = roots.filter(
      (c) =>
        filter === "all" ||
        c.side === filter ||
        replies.get(c.id)?.some((r) => r.side === filter),
    );
    visible.sort((a, b) =>
      sort === "newest" ? b.createdAt - a.createdAt : a.createdAt - b.createdAt,
    );
    return { roots: visible, replies };
  }, [data?.comments, filter, sort]);
  const roots = threads.roots;

  return (
    <div className="app-shell" lang={locale === "en" ? "en-US" : "zh-CN"}>
      <aside className="sidebar">
        <a className="brand" href={`/c/${communityId}`}>
          <span className="brand-icon">
            <MessageSquareQuote size={23} />
          </span>
          debate<span className="brand-light">hub</span>
          <span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">YOUR COMMUNITY</div>
        <button
          className="community-switch"
          onClick={() => setModal(data?.viewer ? "switch" : "join")}
        >
          <span className="community-logo">{t("D")}</span>
          <span>
            <strong>{displayName}</strong>
            <small>
              {communityId === "unnc"
                ? "NINGBO NOTTINGHAM"
                : "DEBATE COMMUNITY"}
            </small>
          </span>
          <ChevronDown size={15} />
        </button>
        <nav aria-label={t("Main navigation")}>
          <button
            className={view === "discussion" ? "nav-item active" : "nav-item"}
            onClick={() => setView("discussion")}
          >
            <LayoutGrid size={19} />
            {t("Community")}
            <ChevronRight size={15} />
          </button>
          <button
            className={view === "topics" ? "nav-item active" : "nav-item"}
            onClick={() => setView("topics")}
          >
            <BookOpen size={19} />
            {t("All motions")}
            {data?.accessible && (
              <span className="nav-count">{data.topics.length}</span>
            )}
          </button>
          <button className="nav-item" onClick={() => setModal("guide")}>
            <CircleHelp size={19} />
            {t("How it works")}
            <ArrowUpRight size={15} />
          </button>
        </nav>
        <div className="sidebar-divider" />
        <div className="workspace-label">LET’S THINK TOGETHER</div>
        <div className="sidebar-note">
          <span className="tiny-quote">“</span>
          <p>
            {t("Debate helps us")}
            <br />
            {t("see other possibilities.")}
          </p>
          <small>BE OPEN. BE CURIOUS.</small>
        </div>
        <div className="sidebar-bottom">
          <span className={`live-dot ${online ? "" : "offline"}`} />
          <span>{online ? t("Connected") : t("Connecting…")}</span>
          <button
            className="icon-button"
            aria-label={t("Community settings")}
            onClick={() =>
              setModal(isAdmin ? "settings" : joined ? "switch" : "login")
            }
          >
            <Settings2 size={17} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <span>{displayName}</span>
            <ChevronRight size={14} />
            <strong>
              {view === "topics" ? t("All motions") : t("Community")}
            </strong>
          </div>
          <div className="topbar-actions">
            <LanguageSwitcher />
            <span className="header-caption">
              {t("Different views. Shared curiosity.")}
            </span>
            {isAdmin && (
              <button
                className="button small outline"
                onClick={() => setModal("members")}
              >
                {t("Manage members")}
                {data?.pendingCount ? `（${data.pendingCount}）` : ""}
              </button>
            )}
            {data?.viewer ? (
              <>
                <button
                  className="user-chip"
                  onClick={() => setModal("switch")}
                  aria-label={t("Switch community")}
                >
                  <span className="mini-avatar">
                    {data?.viewer?.nickname.slice(0, 1)}
                  </span>
                  <span className="user-nickname">
                    {data?.viewer?.nickname}
                  </span>
                  {isAdmin && (
                    <small>
                      {data?.viewer?.role === "owner" ? t("Owner") : t("Admin")}
                    </small>
                  )}
                </button>
                <button
                  className="icon-button"
                  aria-label={t("Sign out")}
                  onClick={() =>
                    perform("logout", {}, () =>
                      setToast(
                        data?.viewer?.username
                          ? t(
                              "Signed out. Sign back in with your username and password.",
                            )
                          : t(
                              "Signed out. Use an invitation to join again with a nickname.",
                            ),
                      ),
                    )
                  }
                >
                  <LogOut size={17} />
                </button>
              </>
            ) : (
              <button
                className="button small dark"
                onClick={() => setModal(invite ? "join" : "login")}
              >
                {t("Sign in / Join")}
                <ArrowUpRight size={15} />
              </button>
            )}
          </div>
        </header>
        <main>
          <section className="welcome">
            <div>
              <span className="eyebrow">
                <span /> A SPACE FOR DIFFERENT PERSPECTIVES
              </span>
              <h1>
                {t("Every perspective")}
                <br />
                {t("deserves to be ")}
                <span>{t("heard.")}</span>
              </h1>
              <p>
                {t(
                  "Start with a question. Exchange ideas. Discover new ways to think.",
                )}
              </p>
              <div className="welcome-tags">
                <span>
                  <Users size={14} />
                  {displayName}
                </span>
                <i />
                {t("Weekly motions · Open expression · Thoughtful discussion")}
              </div>
            </div>
            <div className="debate-art" aria-hidden="true">
              <div className="orbit orbit-one" />
              <div className="orbit orbit-two" />
              <span className="art-spark one">✳</span>
              <span className="art-spark two">+</span>
              <div className="art-card art-pro">
                <span>01 / PERSPECTIVE</span>
                <strong>{t("Pro.")}</strong>
                <div>
                  <i />
                  <i />
                  <i />
                </div>
                <ArrowUpRight size={29} />
              </div>
              <div className="art-card art-con">
                <span>02 / PERSPECTIVE</span>
                <strong>{t("Con.")}</strong>
                <div>
                  <i />
                  <i />
                  <i />
                </div>
                <MessageCircle size={26} />
              </div>
              <span className="art-caption">
                DIFFERENT SIDES. SHARED CURIOSITY.
              </span>
            </div>
          </section>
          {!data ? (
            <div className="loading-card">
              <Radio className="spin" size={26} />
              <h2>
                {error
                  ? t("Unable to connect right now")
                  : t("Opening your community…")}
              </h2>
              <p>
                {error
                  ? errorText(error)
                  : t("Your next conversation is just a moment away.")}
              </p>
              {error && (
                <button className="button dark" onClick={() => void refresh()}>
                  {t("Reconnect")}
                </button>
              )}
            </div>
          ) : !data.accessible ? (
            <section className="locked-card">
              <div className="lock-icon">
                <LockKeyhole size={29} />
              </div>
              <span className="eyebrow">A COMMUNITY, BY INVITATION</span>
              <h2>
                {data.viewer?.joinStatus === "pending"
                  ? t("Your request is awaiting approval.")
                  : t("Good discussions start here.")}
              </h2>
              <p>
                {communityDescription(data.community.description, communityId)}
              </p>
              <div className="private-pill">
                <ShieldCheck size={14} />
                {t("Private community · Members only")}
              </div>
              {data.viewer?.joinStatus === "pending" && (
                <p>
                  {t(
                    "The community will appear here automatically once an owner or admin approves your request.",
                  )}
                </p>
              )}
              {data.viewer?.joinStatus === "rejected" && (
                <p>
                  {t(
                    "Your last request was declined. Contact an admin or apply again with a valid invitation.",
                  )}
                </p>
              )}
              {data.viewer?.joinStatus === "removed" && (
                <p>
                  {t(
                    "You have been removed. A valid invitation and admin approval are needed to rejoin.",
                  )}
                </p>
              )}
              <button
                className="button dark"
                disabled={data.viewer?.joinStatus === "pending"}
                onClick={() => setModal("join")}
              >
                {data.viewer?.joinStatus === "pending"
                  ? t("Awaiting approval")
                  : invite
                    ? data.community.joinApproval
                      ? t("Accept invitation and request to join")
                      : t("Accept invitation and join")
                    : t("Join with an invitation")}
                <ArrowRight size={17} />
              </button>
              <button className="text-button" onClick={() => setModal("login")}>
                {t("Already a member? Sign in")}
                <ArrowUpRight size={14} />
              </button>
            </section>
          ) : (
            <>
              {data.viewer?.joinStatus === "pending" && (
                <p className="membership-banner">
                  {t(
                    "Your request is being reviewed. Once approved, you can vote and post.",
                  )}
                </p>
              )}
              <div className="section-heading">
                <div>
                  <span className="orange-dash" />
                  <h2>
                    {view === "topics"
                      ? t("Questions worth discussing")
                      : t("A new perspective this week")}
                  </h2>
                  {view === "discussion" && (
                    <span className="subtle-tag">WEEKLY DEBATE</span>
                  )}
                </div>
                {isAdmin && (
                  <button
                    className="button small dark"
                    onClick={() => setModal("publish")}
                  >
                    <Plus size={16} />
                    {t("New motion")}
                  </button>
                )}
              </div>
              {view === "topics" ? (
                <section className="topic-library">
                  <label className="search">
                    <Search size={18} />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={t("Search motions or categories")}
                    />
                  </label>
                  {data.topics
                    .filter((t) => `${t.title}${t.category}`.includes(search))
                    .map((motion, i) => (
                      <button
                        className="library-topic"
                        key={motion.id}
                        onClick={() => changeTopic(motion.id)}
                      >
                        <span className="topic-number">
                          {String(data.topics.length - i).padStart(2, "0")}
                        </span>
                        <div>
                          <span className="category">
                            {motion.category} ·{" "}
                            {motion.withdrawn
                              ? t("Withdrawn")
                              : motion.status === "open"
                                ? t("Open")
                                : t("Closed")}
                          </span>
                          <h3>{motion.title}</h3>
                          <span className="muted">
                            {t("Votes: {votes} · Posts: {posts}", {
                              votes: motion.voteCount,
                              posts: motion.commentCount,
                            })}{" "}
                            · {formatTime(motion.createdAt)}
                          </span>
                        </div>
                        <ArrowUpRight size={24} />
                      </button>
                    ))}
                  {!data.topics.filter((t) =>
                    `${t.title}${t.category}`.includes(search),
                  ).length && (
                    <div className="empty">
                      <Search size={25} />
                      <h3>{t("No matching motions yet")}</h3>
                      <p>
                        {t("Try another keyword, or start a new discussion.")}
                      </p>
                    </div>
                  )}
                </section>
              ) : !topic ? (
                <div className="empty panel">
                  <BookOpen size={30} />
                  <h2>{t("The next good question starts with you.")}</h2>
                  <p>
                    {isAdmin
                      ? t(
                          "Choose “New motion” to start your community’s first discussion.",
                        )
                      : t(
                          "An admin is preparing a new motion. Check back soon.",
                        )}
                  </p>
                </div>
              ) : (
                <div className="content-grid">
                  <div className="discussion-column">
                    <section className="motion-card">
                      <div className="motion-meta">
                        <span className="category">
                          <Hash size={13} />
                          {topic.category}
                        </span>
                        <span
                          className={`status-pill ${topic.status === "closed" ? "closed" : ""}`}
                        >
                          <span />
                          {topic.withdrawn
                            ? t("Withdrawn · Admins only")
                            : topic.status === "open"
                              ? t("Discussion open")
                              : t("Discussion closed")}
                        </span>
                      </div>
                      <span className="motion-overline">
                        THIS WEEK’S MOTION
                      </span>
                      <h2>{topic.title}</h2>
                      <p className="motion-description">{topic.description}</p>
                      {topic.withdrawn && (
                        <p className="membership-banner">
                          {t(
                            "This motion is hidden from members. Posts and votes are preserved and will reappear when it is restored.",
                          )}
                        </p>
                      )}
                      {isAdmin && (
                        <div className="topic-actions">
                          <button
                            className="button small outline"
                            onClick={() => setModal("editTopic")}
                          >
                            {t("Edit motion")}
                          </button>
                          <button
                            className="button small outline"
                            disabled={busy}
                            onClick={() =>
                              topic.withdrawn
                                ? perform(
                                    "topics/withdraw",
                                    { topicId: topic.id, withdrawn: false },
                                    () => setToast(t("Motion restored.")),
                                  )
                                : setModal("withdrawTopic")
                            }
                          >
                            {topic.withdrawn
                              ? t("Restore motion")
                              : t("Withdraw motion")}
                          </button>
                        </div>
                      )}
                      <div className="motion-footer">
                        <span>
                          <Users size={15} />
                          {t("Votes: {count}", { count: total })}
                        </span>
                        <span>
                          <MessageCircle size={15} />
                          {t("Posts: {count}", { count: commentCount })}
                        </span>
                        <span>
                          {t("Posted {date}", {
                            date: formatDate(topic.createdAt),
                          })}
                        </span>
                      </div>
                    </section>
                    <section className="stance-section">
                      <div className="mini-heading">
                        <h3>{t("Where do you stand?")}</h3>
                        <span>
                          {data.mySide
                            ? t("You can change your mind")
                            : t("Choose a side and join the conversation")}
                        </span>
                      </div>
                      <div className="vote-privacy">
                        <label>
                          <input
                            type="checkbox"
                            checked={anonymousVote}
                            onChange={(e) =>
                              changeVotePrivacy(e.target.checked)
                            }
                            disabled={
                              busy ||
                              topic.withdrawn ||
                              topic.status === "closed"
                            }
                          />
                          {t("Vote anonymously")}
                        </label>
                        <span>
                          {anonymousVote
                            ? t(
                                "Your vote is counted, but your name is hidden from the voter list.",
                              )
                            : t(
                                "Your nickname appears in the voter list. Tick this first to vote anonymously.",
                              )}
                        </span>
                      </div>
                      <div className="stance-grid">
                        {(["pro", "con"] as Side[]).map((side) => (
                          <button
                            key={side}
                            className={`stance-card ${side} ${data.mySide === side ? "selected" : ""}`}
                            onClick={() => vote(side)}
                            disabled={
                              busy ||
                              topic.withdrawn ||
                              topic.status === "closed"
                            }
                          >
                            <div>
                              <span className="stance-label">
                                {sideName(side)}{" "}
                                <small>
                                  {side === "pro" ? "AFFIRMATIVE" : "NEGATIVE"}
                                </small>
                              </span>
                              {data.mySide === side ? (
                                <Check size={19} />
                              ) : (
                                <ArrowUpRight size={19} />
                              )}
                            </div>
                            <h4>
                              {side === "pro" ? topic.proLabel : topic.conLabel}
                            </h4>
                            <span className="stance-bottom">
                              {data.mySide === side
                                ? t("My side")
                                : t("Choose {side}", { side: sideName(side) })}
                              <span>
                                {t("Voters: {count}", {
                                  count: data.stats[side],
                                })}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </section>
                    <section className="discussion panel" id="discussion">
                      <div className="discussion-heading">
                        <h3>
                          {t("Discussion")}
                          <span>{commentCount}</span>
                        </h3>
                        <label className="sort-label">
                          <span className="sr-only">{t("Sort posts")}</span>
                          <select
                            value={sort}
                            onChange={(e) => setSort(e.target.value)}
                          >
                            <option value="newest">{t("Newest first")}</option>
                            <option value="oldest">{t("Oldest first")}</option>
                          </select>
                          <ArrowDown size={13} />
                        </label>
                      </div>
                      <div
                        className="filter-tabs"
                        role="tablist"
                        aria-label={t("Filter by side")}
                      >
                        {(["all", "pro", "con"] as const).map((f) => (
                          <button
                            role="tab"
                            aria-selected={filter === f}
                            className={filter === f ? "selected" : ""}
                            key={f}
                            onClick={() => setFilter(f)}
                          >
                            {f === "all"
                              ? t("All views")
                              : t("{side} views", { side: sideName(f) })}
                            {f !== "all" && (
                              <span className={`filter-dot ${f}`} />
                            )}
                          </button>
                        ))}
                      </div>
                      <LocalizedForm
                        className="composer"
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (!joined) {
                            setModal("join");
                            return;
                          }
                          if (!data.mySide) {
                            setToast(t("Choose a side above before posting."));
                            return;
                          }
                          perform(
                            "comments",
                            {
                              topicId: topic.id,
                              content: draft,
                              parentId: reply?.id,
                              anonymous,
                            },
                            () => {
                              setDraft("");
                              setReply(null);
                              setToast(
                                t("Posted. Keep the conversation going."),
                              );
                            },
                          );
                        }}
                      >
                        {reply && (
                          <div className="reply-to">
                            {t("Replying to {name}: ", {
                              name: reply.anonymous
                                ? t("Anonymous contributor")
                                : reply.nickname,
                            })}
                            {reply.deleted
                              ? t("This post has been removed.")
                              : reply.content.slice(0, 40)}
                            <button
                              type="button"
                              className="icon-button"
                              aria-label={t("Cancel reply")}
                              onClick={() => setReply(null)}
                            >
                              <X size={14} />
                            </button>
                          </div>
                        )}
                        <textarea
                          ref={composer}
                          aria-label={t("Your viewpoint")}
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          maxLength={3000}
                          rows={3}
                          disabled={
                            topic.withdrawn || topic.status === "closed"
                          }
                          placeholder={
                            topic.status === "closed"
                              ? t(
                                  "This discussion is closed. Thank you for sharing your perspective.",
                                )
                              : t("Share your reasoning…")
                          }
                        />
                        <div className="composer-identity">
                          <label>
                            <input
                              type="checkbox"
                              checked={anonymous}
                              onChange={(e) => setAnonymous(e.target.checked)}
                              disabled={
                                topic.withdrawn || topic.status === "closed"
                              }
                            />
                            {t("Post anonymously")}
                          </label>
                          <span>
                            {anonymous
                              ? t(
                                  "This post hides your nickname. Vote anonymity is set separately above.",
                                )
                              : t("Posting as {name}", {
                                  name:
                                    data.viewer?.nickname ||
                                    t("Community nickname"),
                                })}
                          </span>
                        </div>
                        <div className="composer-bottom">
                          <span>
                            {data.mySide ? (
                              <>
                                <span className={`filter-dot ${data.mySide}`} />
                                {t("Posting on the {side} side", {
                                  side: sideName(data.mySide),
                                })}
                              </>
                            ) : (
                              t("Choose a side, then share your reasoning")
                            )}
                            <small>{draft.length}/3000</small>
                          </span>
                          <button
                            className="button small dark"
                            disabled={
                              busy ||
                              topic.withdrawn ||
                              topic.status === "closed" ||
                              (joined && draft.trim().length < 2)
                            }
                            type="submit"
                          >
                            {busy ? t("Posting…") : t("Post viewpoint")}
                            <Send size={14} />
                          </button>
                        </div>
                      </LocalizedForm>
                      <div className="comment-list">
                        {roots.length ? (
                          roots.map((c) => (
                            <div className="thread" key={c.id}>
                              {renderComment(c)}
                              {(threads.replies.get(c.id) ?? [])
                                .filter(
                                  (r) =>
                                    filter === "all" ||
                                    r.side === filter ||
                                    c.side === filter,
                                )
                                .map((r) => renderComment(r, true))}
                            </div>
                          ))
                        ) : (
                          <div className="empty">
                            <MessageSquareQuote size={29} strokeWidth={1.4} />
                            <h4>
                              {filter === "all"
                                ? t("Be the first to share a perspective.")
                                : t("Add your voice to this side.")}
                            </h4>
                            <p>
                              {t(
                                "It does not have to be perfect. A reasoned perspective is a great start.",
                              )}
                            </p>
                          </div>
                        )}
                      </div>
                    </section>
                  </div>
                  <aside className="right-column">
                    <section className="stats-card panel">
                      <div className="mini-heading">
                        <h3>{t("Where we stand")}</h3>
                        <span
                          className={`realtime ${online ? "" : "disconnected"}`}
                        >
                          <span />
                          {online ? t("Live") : t("Reconnecting")}
                        </span>
                      </div>
                      <p className="card-subtitle">
                        {t("Different voices. A shared conversation.")}
                      </p>
                      <div className="stats-percent">
                        <div>
                          <small>{t("Pro")}</small>
                          <strong>
                            {proPercent}
                            <em>%</em>
                          </strong>
                        </div>
                        <span>VS</span>
                        <div>
                          <small>{t("Con")}</small>
                          <strong>
                            {total ? 100 - proPercent : 0}
                            <em>%</em>
                          </strong>
                        </div>
                      </div>
                      <div className={`ratio-bar ${!total ? "no-votes" : ""}`}>
                        <span style={{ width: `${proPercent}%` }} />
                        <span
                          style={{ width: `${total ? 100 - proPercent : 0}%` }}
                        />
                      </div>
                      <div className="stats-counts">
                        <span>
                          <i className="filter-dot pro" />
                          {t("Voters: {count}", { count: data.stats.pro })}
                        </span>
                        <span>
                          {t("Voters: {count}", { count: data.stats.con })}
                          <i className="filter-dot con" />
                        </span>
                      </div>
                      <div className="stats-note">
                        <Radio size={14} />
                        {total
                          ? t(
                              "Total votes: {count} · Updates appear automatically",
                              { count: total },
                            )
                          : t("No votes yet. Be the first to choose a side.")}
                      </div>
                      {joined ? (
                        <details className="vote-detail">
                          <summary>
                            {t("See members’ votes")}
                            <ChevronDown size={14} />
                          </summary>
                          <p>
                            {t(
                              "Current choices are shown below. Anonymous votes hide nicknames.",
                            )}
                          </p>
                          {data.voters.length ? (
                            <ul className="voter-list">
                              {data.voters.map((v, index) => (
                                <li key={v.userId || `anonymous-${index}`}>
                                  <span className="voter-name">
                                    {v.anonymous
                                      ? t("Anonymous member")
                                      : v.nickname}
                                    {v.isMine && <small>{t("You")}</small>}
                                  </span>
                                  <span className={`side-label ${v.side}`}>
                                    {sideName(v.side)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="voter-empty">
                              {t("No members have voted yet")}
                            </div>
                          )}
                        </details>
                      ) : (
                        <p className="voter-join-note">
                          {t("Join this community to see members’ votes.")}
                        </p>
                      )}
                    </section>
                    <section className="community-card panel">
                      <span className="eyebrow">OUR LITTLE CORNER</span>
                      <div className="community-card-title">
                        <span className="community-logo large">{t("D")}</span>
                        <div>
                          <h3>{displayName}</h3>
                          <span>
                            {communityId === "unnc"
                              ? "Ningbo Nottingham Debate"
                              : "A community for curious minds"}
                          </span>
                        </div>
                      </div>
                      <p>{data.community.description}</p>
                      <div className="community-facts">
                        <span>
                          <Users size={15} />
                          {t("Members: {count}", {
                            count: data.community.memberCount,
                          })}
                        </span>
                        <span>
                          {data.community.visibility === "private" ? (
                            <LockKeyhole size={14} />
                          ) : (
                            <Globe2 size={14} />
                          )}
                          {data.community.visibility === "private"
                            ? t("Private community")
                            : t("Public community")}
                        </span>
                      </div>
                      {isAdmin ? (
                        <button
                          className="button outline full"
                          onClick={openInvite}
                        >
                          <Plus size={16} />
                          {t("Invite people")}
                          <ArrowUpRight size={16} />
                        </button>
                      ) : !joined ? (
                        <button
                          className="button outline full"
                          onClick={() => setModal("join")}
                        >
                          {t("Join community")}
                          <ArrowRight size={16} />
                        </button>
                      ) : (
                        <div className="joined-note">
                          <Check size={15} />
                          {t("Glad to have you here.")}
                        </div>
                      )}
                    </section>
                    <section className="ground-rules">
                      <span className="rules-icon">
                        <Sparkles size={18} />
                      </span>
                      <h3>{t("Be thoughtful. Be kind.")}</h3>
                      <p>
                        {t("Challenge ideas. Respect the people behind them.")}
                        <br />
                        {t(
                          "Give reasons, and leave room for other perspectives.",
                        )}
                      </p>
                      <button
                        className="text-button"
                        onClick={() => setModal("guide")}
                      >
                        {t("Read our discussion guidelines")}
                        <ArrowUpRight size={14} />
                      </button>
                    </section>
                    {isAdmin && (
                      <button
                        className="manage-link"
                        onClick={() => setModal("settings")}
                      >
                        <Settings2 size={15} />
                        {t("Manage community")}
                        <ArrowRight size={14} />
                      </button>
                    )}
                  </aside>
                </div>
              )}
            </>
          )}
          <footer>
            <span>
              <MessageSquareQuote size={15} />
              DEBATEHUB
            </span>
            <span>
              {t("Different perspectives. Broader horizons.")}
              <span className="footer-dot">·</span> MADE FOR CURIOUS MINDS
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          {errorText(toast)}
          <button
            className="icon-button"
            aria-label={t("Dismiss notification")}
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {error && data && (
        <div className="connection-banner" role="status">
          {t("Updates paused. Reconnecting automatically…")}
          {errorText(error)}
        </div>
      )}
      <CommunityModals
        feedback={toast}
        modal={modal}
        setModal={setModal}
        data={data}
        busy={busy}
        invite={invite}
        setupToken={setupToken}
        clearSetupToken={() => setSetupToken("")}
        inviteUrl={inviteUrl}
        communityId={communityId}
        deleteTarget={deleteTarget}
        setDeleteTarget={setDeleteTarget}
        notify={setToast}
        perform={perform}
        selectTopic={changeTopic}
        members={members}
        requests={requests}
        communities={communities}
      />
    </div>
  );
}
