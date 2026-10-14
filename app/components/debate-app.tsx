"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import type { Comment, Side, State, Member, CommunityLink } from "@/lib/types";
import CommunityModals, { type ModalName } from "./community-modals";

const sideName = (side: Side) => (side === "pro" ? "正方" : "反方");
const formatTime = (value: number) =>
  new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Shanghai",
  }).format(value);

export default function DebateApp({
  communityId = "unnc",
}: {
  communityId?: string;
}) {
  const [data, setData] = useState<State | null>(null);
  const [selectedTopic, setSelectedTopic] = useState("");
  const [view, setView] = useState<"discussion" | "topics">("discussion");
  const [modal, setModal] = useState<ModalName>(null);
  const [error, setError] = useState("");
  const [online, setOnline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [invite, setInvite] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [filter, setFilter] = useState<"all" | Side>("all");
  const [sort, setSort] = useState("newest");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [reply, setReply] = useState<Comment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [communities, setCommunities] = useState<CommunityLink[] | null>(null);
  const seq = useRef(0);
  const mutationLock = useRef(false);
  const composer = useRef<HTMLTextAreaElement>(null);
  const refresh = useCallback(async () => {
    const current = ++seq.current;
    try {
      const response = await fetch(
        `/api/state?community=${encodeURIComponent(communityId)}${selectedTopic ? `&topic=${encodeURIComponent(selectedTopic)}` : ""}`,
        { cache: "no-store" },
      );
      const value = (await response.json()) as State & { error?: string };
      if (!response.ok) throw new Error(value.error);
      if (seq.current === current) {
        setData(value);
        setOnline(true);
        setError("");
      }
    } catch (e) {
      if (seq.current === current) {
        setOnline(false);
        setError(e instanceof Error ? e.message : "连接失败，请重试");
      }
    }
  }, [communityId, selectedTopic]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 2000);
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    return () => {
      clearInterval(timer);
      ++seq.current;
      window.removeEventListener("focus", focus);
    };
  }, [refresh]);
  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get(
      "invite",
    );
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
  const loadMembers = useCallback(async () => {
    const response = await fetch(
      `/api/members?community=${encodeURIComponent(communityId)}`,
      { cache: "no-store" },
    );
    const result = (await response.json()) as {
      members: Member[];
      error?: string;
    };
    if (!response.ok) throw new Error(result.error);
    setMembers(result.members);
  }, [communityId]);
  useEffect(() => {
    if (modal === "members") {
      setMembers(null);
      void loadMembers().catch((e) => setToast(e.message));
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
        if (!response.ok) throw new Error(result.error || "操作失败，请重试");
        done?.(result);
        if (path === "join") setInvite("");
        if (path === "invites/revoke") setInviteUrl("");
        if (path === "members/role") await loadMembers();
        await refresh();
      } catch (e) {
        setToast(e instanceof Error ? e.message : "操作失败，请重试");
      } finally {
        mutationLock.current = false;
        setBusy(false);
      }
    })();
  }
  const isAdmin = ["owner", "admin"].includes(data?.viewer?.role ?? "");
  const joined = !!data?.viewer?.role;
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
    perform("votes", { topicId: topic?.id, side }, () =>
      setToast(`已选择${sideName(side)}，期待你的观点`),
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
      <div className={`avatar ${c.side}`}>{c.nickname.slice(0, 1)}</div>
      <div className="comment-main">
        <div className="comment-byline">
          <strong>{c.nickname}</strong>
          <span className={`side-label ${c.side}`}>{sideName(c.side)}</span>
          <time>{formatTime(c.createdAt)}</time>
        </div>
        <p className={c.deleted ? "deleted" : ""}>{c.content}</p>
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
              disabled={topic?.status === "closed"}
            >
              <MessageCircle size={14} />
              回复
            </button>
            {(isAdmin || data?.viewer?.id === c.userId) && (
              <button onClick={() => setDeleteTarget(c.id)}>
                <Trash2 size={13} />
                移除
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
  let roots = data?.comments.filter((c) => !c.parentId) ?? [];
  if (filter !== "all")
    roots = roots.filter(
      (c) =>
        c.side === filter ||
        data?.comments.some((r) => r.parentId === c.id && r.side === filter),
    );
  roots = [...roots].sort((a, b) =>
    sort === "newest" ? b.createdAt - a.createdAt : a.createdAt - b.createdAt,
  );

  return (
    <div className="app-shell">
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
          <span className="community-logo">辩</span>
          <span>
            <strong>{data?.community.name || "宁诺例辩"}</strong>
            <small>
              {communityId === "unnc"
                ? "NINGBO NOTTINGHAM"
                : "DEBATE COMMUNITY"}
            </small>
          </span>
          <ChevronDown size={15} />
        </button>
        <nav aria-label="主导航">
          <button
            className={view === "discussion" ? "nav-item active" : "nav-item"}
            onClick={() => setView("discussion")}
          >
            <LayoutGrid size={19} />
            社区广场
            <ChevronRight size={15} />
          </button>
          <button
            className={view === "topics" ? "nav-item active" : "nav-item"}
            onClick={() => setView("topics")}
          >
            <BookOpen size={19} />
            全部辩题
            {data?.accessible && (
              <span className="nav-count">{data.topics.length}</span>
            )}
          </button>
          <button className="nav-item" onClick={() => setModal("guide")}>
            <CircleHelp size={19} />
            参与指南
            <ArrowUpRight size={15} />
          </button>
        </nav>
        <div className="sidebar-divider" />
        <div className="workspace-label">LET’S THINK TOGETHER</div>
        <div className="sidebar-note">
          <span className="tiny-quote">“</span>
          <p>
            辩论的意义，
            <br />
            是看见另一种可能。
          </p>
          <small>BE OPEN. BE CURIOUS.</small>
        </div>
        <div className="sidebar-bottom">
          <span className={`live-dot ${online ? "" : "offline"}`} />
          <span>{online ? "社区已连接" : "正在连接社区"}</span>
          <button
            className="icon-button"
            aria-label="社区设置"
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
            <span>{data?.community.name || "宁诺例辩"}</span>
            <ChevronRight size={14} />
            <strong>{view === "topics" ? "全部辩题" : "社区广场"}</strong>
          </div>
          <div className="topbar-actions">
            <span className="header-caption">让观点相遇，让思考发生</span>
            {joined ? (
              <>
                <button
                  className="user-chip"
                  onClick={() => setModal("switch")}
                  aria-label="切换社群"
                >
                  <span className="mini-avatar">
                    {data?.viewer?.nickname.slice(0, 1)}
                  </span>
                  {data?.viewer?.nickname}
                  {isAdmin && (
                    <small>
                      {data?.viewer?.role === "owner" ? "群主" : "管理员"}
                    </small>
                  )}
                </button>
                <button
                  className="icon-button"
                  aria-label="退出登录"
                  onClick={() =>
                    perform("logout", {}, () =>
                      setToast("已退出，私密社区需邀请链接重新加入"),
                    )
                  }
                >
                  <LogOut size={17} />
                </button>
              </>
            ) : (
              <button
                className="button small dark"
                onClick={() => setModal("join")}
              >
                加入社区
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
                每一种立场，
                <br />
                都值得被<span>认真听见。</span>
              </h1>
              <p>从一个问题出发，在观点交锋中，遇见更开阔的自己。</p>
              <div className="welcome-tags">
                <span>
                  <Users size={14} />
                  {data?.community.name || "宁诺辩论社区"}
                </span>
                <i />
                每周辩题 · 自由表达 · 理性讨论
              </div>
            </div>
            <div className="debate-art" aria-hidden="true">
              <div className="orbit orbit-one" />
              <div className="orbit orbit-two" />
              <span className="art-spark one">✳</span>
              <span className="art-spark two">+</span>
              <div className="art-card art-pro">
                <span>01 / PERSPECTIVE</span>
                <strong>正。</strong>
                <div>
                  <i />
                  <i />
                  <i />
                </div>
                <ArrowUpRight size={29} />
              </div>
              <div className="art-card art-con">
                <span>02 / PERSPECTIVE</span>
                <strong>反。</strong>
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
              <h2>{error ? "暂时无法连接社区" : "正在打开社区…"}</h2>
              <p>{error || "让思考相遇，只需片刻。"}</p>
              {error && (
                <button className="button dark" onClick={() => void refresh()}>
                  重新连接
                </button>
              )}
            </div>
          ) : !data.accessible ? (
            <section className="locked-card">
              <div className="lock-icon">
                <LockKeyhole size={29} />
              </div>
              <span className="eyebrow">A COMMUNITY, BY INVITATION</span>
              <h2>好的讨论，从这里开始。</h2>
              <p>{data.community.description}</p>
              <div className="private-pill">
                <ShieldCheck size={14} />
                这是一个私密社区 · 仅受邀成员可见
              </div>
              <button className="button dark" onClick={() => setModal("join")}>
                {invite ? "接受邀请，加入讨论" : "使用邀请加入"}
                <ArrowRight size={17} />
              </button>
              <button className="text-button" onClick={() => setModal("login")}>
                我是管理员 <ArrowUpRight size={14} />
              </button>
            </section>
          ) : (
            <>
              <div className="section-heading">
                <div>
                  <span className="orange-dash" />
                  <h2>
                    {view === "topics"
                      ? "所有值得讨论的问题"
                      : "本周，聊点不一样的"}
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
                    发布辩题
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
                      placeholder="搜索辩题或分类"
                    />
                  </label>
                  {data.topics
                    .filter((t) => `${t.title}${t.category}`.includes(search))
                    .map((t, i) => (
                      <button
                        className="library-topic"
                        key={t.id}
                        onClick={() => changeTopic(t.id)}
                      >
                        <span className="topic-number">
                          {String(data.topics.length - i).padStart(2, "0")}
                        </span>
                        <div>
                          <span className="category">
                            {t.category} ·{" "}
                            {t.status === "open" ? "讨论中" : "已结束"}
                          </span>
                          <h3>{t.title}</h3>
                          <span className="muted">
                            {t.voteCount} 人持方 · {t.commentCount} 条讨论 ·{" "}
                            {formatTime(t.createdAt)}
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
                      <h3>还没有找到相关辩题</h3>
                      <p>换个关键词，或发起一个新问题。</p>
                    </div>
                  )}
                </section>
              ) : !topic ? (
                <div className="empty panel">
                  <BookOpen size={30} />
                  <h2>下一个好问题，等你发起。</h2>
                  <p>
                    {isAdmin
                      ? "点击“发布辩题”，开启社区的第一次讨论。"
                      : "管理员正在准备新的辩题，稍后回来看看。"}
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
                          {topic.status === "open" ? "正在讨论" : "讨论已结束"}
                        </span>
                      </div>
                      <span className="motion-overline">
                        THIS WEEK’S MOTION
                      </span>
                      <h2>{topic.title}</h2>
                      <p className="motion-description">{topic.description}</p>
                      <div className="motion-footer">
                        <span>
                          <Users size={15} />
                          {total} 人已选择持方
                        </span>
                        <span>
                          <MessageCircle size={15} />
                          {commentCount} 条讨论
                        </span>
                        <span>
                          发布于 {formatTime(topic.createdAt).split(" ")[0]}
                        </span>
                      </div>
                    </section>
                    <section className="stance-section">
                      <div className="mini-heading">
                        <h3>你的立场，由你表达</h3>
                        <span>
                          {data.mySide
                            ? "可以随时改变想法"
                            : "选择持方，加入这场思想碰撞"}
                        </span>
                      </div>
                      <div className="stance-grid">
                        {(["pro", "con"] as Side[]).map((side) => (
                          <button
                            key={side}
                            className={`stance-card ${side} ${data.mySide === side ? "selected" : ""}`}
                            onClick={() => vote(side)}
                            disabled={busy || topic.status === "closed"}
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
                                ? "我的立场"
                                : `站${sideName(side)}`}
                              <span>{data.stats[side]} 人</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </section>
                    <section className="discussion panel" id="discussion">
                      <div className="discussion-heading">
                        <h3>
                          观点交锋<span>{commentCount}</span>
                        </h3>
                        <label className="sort-label">
                          <span className="sr-only">评论排序</span>
                          <select
                            value={sort}
                            onChange={(e) => setSort(e.target.value)}
                          >
                            <option value="newest">最新发表</option>
                            <option value="oldest">最早发表</option>
                          </select>
                          <ArrowDown size={13} />
                        </label>
                      </div>
                      <div
                        className="filter-tabs"
                        role="tablist"
                        aria-label="按持方筛选"
                      >
                        {(["all", "pro", "con"] as const).map((f) => (
                          <button
                            role="tab"
                            aria-selected={filter === f}
                            className={filter === f ? "selected" : ""}
                            key={f}
                            onClick={() => setFilter(f)}
                          >
                            {f === "all" ? "全部观点" : `${sideName(f)}观点`}
                            {f !== "all" && (
                              <span className={`filter-dot ${f}`} />
                            )}
                          </button>
                        ))}
                      </div>
                      <form
                        className="composer"
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (!joined) {
                            setModal("join");
                            return;
                          }
                          if (!data.mySide) {
                            setToast("先在上方选择持方，再发表观点");
                            return;
                          }
                          perform(
                            "comments",
                            {
                              topicId: topic.id,
                              content: draft,
                              parentId: reply?.id,
                            },
                            () => {
                              setDraft("");
                              setReply(null);
                              setToast("观点已发布，让讨论继续");
                            },
                          );
                        }}
                      >
                        {reply && (
                          <div className="reply-to">
                            回复 {reply.nickname}：{reply.content.slice(0, 40)}
                            <button
                              type="button"
                              className="icon-button"
                              aria-label="取消回复"
                              onClick={() => setReply(null)}
                            >
                              <X size={14} />
                            </button>
                          </div>
                        )}
                        <textarea
                          ref={composer}
                          aria-label="你的观点"
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          maxLength={3000}
                          rows={3}
                          disabled={topic.status === "closed"}
                          placeholder={
                            topic.status === "closed"
                              ? "本次讨论已结束，感谢每一个认真思考的你。"
                              : "说说你的理由，让观点被看见…"
                          }
                        />
                        <div className="composer-bottom">
                          <span>
                            {data.mySide ? (
                              <>
                                <span className={`filter-dot ${data.mySide}`} />
                                以{sideName(data.mySide)}身份发言
                              </>
                            ) : (
                              "先选择持方，再带着理由加入"
                            )}
                            <small>{draft.length}/3000</small>
                          </span>
                          <button
                            className="button small dark"
                            disabled={
                              busy ||
                              topic.status === "closed" ||
                              (joined && draft.trim().length < 2)
                            }
                            type="submit"
                          >
                            {busy ? "发送中…" : "发布观点"}
                            <Send size={14} />
                          </button>
                        </div>
                      </form>
                      <div className="comment-list">
                        {roots.length ? (
                          roots.map((c) => (
                            <div className="thread" key={c.id}>
                              {renderComment(c)}
                              {data.comments
                                .filter(
                                  (r) =>
                                    r.parentId === c.id &&
                                    (filter === "all" ||
                                      r.side === filter ||
                                      c.side === filter),
                                )
                                .map((r) => renderComment(r, true))}
                            </div>
                          ))
                        ) : (
                          <div className="empty">
                            <MessageSquareQuote size={29} strokeWidth={1.4} />
                            <h4>
                              {filter === "all"
                                ? "好观点，正在等一个开场。"
                                : "这一方的声音，等你来补充。"}
                            </h4>
                            <p>不必完美，有理有据地表达就很好。</p>
                          </div>
                        )}
                      </div>
                    </section>
                  </div>
                  <aside className="right-column">
                    <section className="stats-card panel">
                      <div className="mini-heading">
                        <h3>持方风向</h3>
                        <span
                          className={`realtime ${online ? "" : "disconnected"}`}
                        >
                          <span />
                          {online ? "实时" : "重连中"}
                        </span>
                      </div>
                      <p className="card-subtitle">
                        不同的声音，组成此刻的我们
                      </p>
                      <div className="stats-percent">
                        <div>
                          <small>正方</small>
                          <strong>
                            {proPercent}
                            <em>%</em>
                          </strong>
                        </div>
                        <span>VS</span>
                        <div>
                          <small>反方</small>
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
                          {data.stats.pro} 人
                        </span>
                        <span>
                          {data.stats.con} 人<i className="filter-dot con" />
                        </span>
                      </div>
                      <div className="stats-note">
                        <Radio size={14} />
                        {total
                          ? `共 ${total} 人参与持方 · 约每 2 秒同步`
                          : "暂无持方，成为第一个表达立场的人"}
                      </div>
                    </section>
                    <section className="community-card panel">
                      <span className="eyebrow">OUR LITTLE CORNER</span>
                      <div className="community-card-title">
                        <span className="community-logo large">辩</span>
                        <div>
                          <h3>{data.community.name}</h3>
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
                          {data.community.memberCount} 位成员
                        </span>
                        <span>
                          {data.community.visibility === "private" ? (
                            <LockKeyhole size={14} />
                          ) : (
                            <Globe2 size={14} />
                          )}
                          {data.community.visibility === "private"
                            ? "私密社区"
                            : "公开社区"}
                        </span>
                      </div>
                      {isAdmin ? (
                        <button
                          className="button outline full"
                          onClick={openInvite}
                        >
                          <Plus size={16} />
                          邀请伙伴加入
                          <ArrowUpRight size={16} />
                        </button>
                      ) : !joined ? (
                        <button
                          className="button outline full"
                          onClick={() => setModal("join")}
                        >
                          加入社区
                          <ArrowRight size={16} />
                        </button>
                      ) : (
                        <div className="joined-note">
                          <Check size={15} />
                          很高兴，你也在这里。
                        </div>
                      )}
                    </section>
                    <section className="ground-rules">
                      <span className="rules-icon">
                        <Sparkles size={18} />
                      </span>
                      <h3>有锋芒，也有温度。</h3>
                      <p>
                        回应观点，而非评判彼此。
                        <br />
                        用理由说话，也给不同留一点空间。
                      </p>
                      <button
                        className="text-button"
                        onClick={() => setModal("guide")}
                      >
                        看看我们的讨论约定
                        <ArrowUpRight size={14} />
                      </button>
                    </section>
                    {isAdmin && (
                      <button
                        className="manage-link"
                        onClick={() => setModal("settings")}
                      >
                        <Settings2 size={15} />
                        管理社区与讨论
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
              在不同中，看见更多。<span className="footer-dot">·</span> MADE FOR
              CURIOUS MINDS
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          {toast}
          <button
            className="icon-button"
            aria-label="关闭提示"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {error && data && (
        <div className="connection-banner" role="status">
          同步暂时中断，正在重新连接。{error}
        </div>
      )}
      <CommunityModals
        modal={modal}
        setModal={setModal}
        data={data}
        busy={busy}
        invite={invite}
        inviteUrl={inviteUrl}
        communityId={communityId}
        deleteTarget={deleteTarget}
        setDeleteTarget={setDeleteTarget}
        notify={setToast}
        perform={perform}
        selectTopic={changeTopic}
        members={members}
        communities={communities}
      />
    </div>
  );
}
