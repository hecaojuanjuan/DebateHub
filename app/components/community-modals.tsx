"use client";

import { useEffect, useRef, type ReactNode, type FormEvent } from "react";
import {
  ArrowRight,
  ArrowDown,
  ArrowUpRight,
  Copy,
  Radio,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { State, Member, CommunityLink } from "@/lib/types";

export type ModalName =
  | "join"
  | "login"
  | "invite"
  | "publish"
  | "settings"
  | "guide"
  | "community"
  | "members"
  | "switch"
  | null;
export function Modal({
  title,
  subtitle,
  children,
  onClose,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="modal"
    >
      <div className="modal-inner">
        <button
          className="icon-button modal-close"
          onClick={onClose}
          aria-label="关闭"
        >
          <X size={20} />
        </button>
        <span className="eyebrow">DEBATEHUB COMMUNITY</span>
        <h2>{title}</h2>
        {subtitle && <p className="muted">{subtitle}</p>}
        {children}
      </div>
    </dialog>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
type Props = {
  modal: ModalName;
  setModal: (value: ModalName) => void;
  data: State | null;
  busy: boolean;
  invite: string;
  inviteUrl: string;
  communityId: string;
  deleteTarget: string | null;
  setDeleteTarget: (value: string | null) => void;
  notify: (value: string) => void;
  perform: (
    path: string,
    body: Record<string, unknown>,
    done?: (result: Record<string, any>) => void,
  ) => void;
  selectTopic: (value: string) => void;
  members: Member[] | null;
  communities: CommunityLink[] | null;
};
export default function CommunityModals({
  modal,
  setModal,
  data,
  busy,
  invite,
  inviteUrl,
  communityId,
  deleteTarget,
  setDeleteTarget,
  notify,
  perform,
  selectTopic,
  members,
  communities,
}: Props) {
  const close = () => setModal(null);
  function submit(
    event: FormEvent<HTMLFormElement>,
    path: string,
    done?: (result: Record<string, any>) => void,
  ) {
    event.preventDefault();
    perform(
      path,
      Object.fromEntries(new FormData(event.currentTarget)),
      done ?? close,
    );
  }
  const topic = data?.topic;
  return (
    <>
      {modal === "join" && (
        <Modal
          title={invite ? "你被邀请，加入这场对话。" : "从一个昵称开始。"}
          subtitle={`加入${data?.community.name || "社区"}，让你的观点被认真听见。`}
          onClose={close}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const values = Object.fromEntries(new FormData(e.currentTarget));
              perform(
                "join",
                { ...values, invite: values.invite || invite },
                () => {
                  close();
                  history.replaceState(null, "", location.pathname);
                  notify("欢迎加入，一起交换观点");
                },
              );
            }}
          >
            <Field label="你希望大家怎么称呼你？">
              <input
                name="nickname"
                placeholder="输入昵称（2–20 字）"
                minLength={2}
                maxLength={20}
                defaultValue={data?.viewer?.nickname}
                required
                autoComplete="nickname"
              />
            </Field>
            {!invite && data?.community.visibility !== "public" && (
              <Field label="邀请凭证">
                <input
                  name="invite"
                  placeholder="粘贴邀请链接或凭证"
                  required
                  onChange={(e) => {
                    if (e.target.value.includes("#invite="))
                      e.target.value = e.target.value.split("#invite=")[1];
                  }}
                />
              </Field>
            )}
            <p className="form-note">
              <ShieldCheck size={15} />
              登录状态保存在当前浏览器，有效期 30 天。
            </p>
            <button className="button dark full" disabled={busy}>
              {busy ? "正在加入…" : "进入社区，开始思考"}
              <ArrowRight size={16} />
            </button>
            <button
              type="button"
              className="text-button center"
              onClick={() => setModal("login")}
            >
              管理员入口
              <ArrowUpRight size={14} />
            </button>
          </form>
        </Modal>
      )}
      {modal === "login" && (
        <Modal
          title="欢迎回来，组织者。"
          subtitle="输入管理员口令，管理社区的每一次观点交锋。"
          onClose={close}
        >
          <form onSubmit={(e) => submit(e, "admin/login")}>
            <Field label="管理员昵称">
              <input
                name="nickname"
                defaultValue="社区管理员"
                minLength={2}
                maxLength={20}
                required
              />
            </Field>
            <Field label="管理员口令">
              <input
                type="password"
                name="key"
                required
                autoComplete="current-password"
                placeholder="输入管理员口令"
              />
            </Field>
            <button className="button dark full" disabled={busy}>
              进入管理
              <ShieldCheck size={16} />
            </button>
          </form>
        </Modal>
      )}
      {modal === "invite" && (
        <Modal
          title="让更多好观点，加入进来。"
          subtitle="邀请链接 7 天有效。收到邀请的人可输入昵称加入社区。"
          onClose={close}
        >
          {inviteUrl ? (
            <>
              <div className="qr-wrapper">
                <QRCodeSVG
                  value={inviteUrl}
                  size={200}
                  level="M"
                  marginSize={3}
                />
                <strong>{data?.community.name} · 扫码加入</strong>
                <small>一起交换观点，练习思考。</small>
              </div>
              <div className="copy-box">
                <input readOnly value={inviteUrl} aria-label="邀请链接" />
                <button
                  className="icon-button"
                  aria-label="复制邀请链接"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(inviteUrl)
                      .then(() => notify("邀请链接已复制"))
                      .catch(() => notify("请选中链接手动复制"))
                  }
                >
                  <Copy size={18} />
                </button>
              </div>
              <button
                className="button dark full"
                onClick={() => {
                  const svg = document.querySelector(".qr-wrapper svg");
                  if (!svg) return;
                  const blob = new Blob(
                    [new XMLSerializer().serializeToString(svg)],
                    { type: "image/svg+xml" },
                  );
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `${communityId}-invite.svg`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                下载邀请二维码
                <ArrowDown size={16} />
              </button>
            </>
          ) : (
            <div className="empty">
              <Radio className="spin" />
              <p>{busy ? "正在生成邀请…" : "生成失败，请关闭后重试。"}</p>
            </div>
          )}
        </Modal>
      )}
      {modal === "publish" && (
        <Modal
          title="一个好问题，打开新的可能。"
          subtitle="写清辩题与双方立场，让讨论更有方向。"
          onClose={close}
        >
          <form
            onSubmit={(e) =>
              submit(e, "topics/create", (result) => {
                selectTopic(result.id);
                close();
                notify("新辩题已发布");
              })
            }
          >
            <Field label="辩题">
              <input
                name="title"
                placeholder="例如：大学教育应以通识教育为主"
                minLength={5}
                maxLength={120}
                required
              />
            </Field>
            <Field label="背景与讨论范围">
              <textarea
                name="description"
                rows={3}
                minLength={5}
                maxLength={3000}
                placeholder="写下背景、定义或希望讨论的方向…"
                required
              />
            </Field>
            <div className="form-grid">
              <Field label="正方立场">
                <input
                  name="proLabel"
                  minLength={2}
                  maxLength={80}
                  placeholder="正方支持的观点"
                  required
                />
              </Field>
              <Field label="反方立场">
                <input
                  name="conLabel"
                  minLength={2}
                  maxLength={80}
                  placeholder="反方支持的观点"
                  required
                />
              </Field>
            </div>
            <Field label="分类">
              <input
                name="category"
                defaultValue="每周训练"
                minLength={2}
                maxLength={20}
                required
              />
            </Field>
            <button className="button dark full" disabled={busy}>
              发布，开始讨论
              <ArrowUpRight size={16} />
            </button>
          </form>
        </Modal>
      )}
      {modal === "settings" && (
        <Modal
          title="给好的讨论，一个好空间。"
          subtitle="管理社群的可见性、邀请和讨论状态。"
          onClose={close}
        >
          {data?.viewer?.role === "owner" && (
            <>
              <div className="setting-row">
                <div>
                  <strong>成员与权限</strong>
                  <p>从已加入的成员中添加或撤销管理员</p>
                </div>
                <button
                  className="button small outline"
                  onClick={() => setModal("members")}
                >
                  管理成员
                </button>
              </div>
              <div className="setting-row">
                <div>
                  <strong>社群可见性</strong>
                  <p>
                    {data.community.visibility === "private"
                      ? "仅受邀成员能查看和参与"
                      : "任何人能查看，加入后能参与"}
                  </p>
                </div>
                <button
                  className="button small outline"
                  disabled={busy}
                  onClick={() =>
                    perform("settings", {
                      visibility:
                        data.community.visibility === "private"
                          ? "public"
                          : "private",
                    })
                  }
                >
                  {data.community.visibility === "private"
                    ? "设为公开"
                    : "设为私密"}
                </button>
              </div>
            </>
          )}
          {topic && (
            <div className="setting-row">
              <div>
                <strong>当前辩题</strong>
                <p>
                  {topic.status === "open"
                    ? "成员可以选择持方与发言"
                    : "已结束，可查看历史讨论"}
                </p>
              </div>
              <button
                className="button small outline"
                disabled={busy}
                onClick={() =>
                  perform("topics/status", {
                    topicId: topic.id,
                    status: topic.status === "open" ? "closed" : "open",
                  })
                }
              >
                {topic.status === "open" ? "结束讨论" : "重新开放"}
              </button>
            </div>
          )}
          <div className="setting-row">
            <div>
              <strong>邀请链接</strong>
              <p>使所有未使用的邀请失效</p>
            </div>
            <button
              className="button small outline danger"
              disabled={busy}
              onClick={() =>
                perform("invites/revoke", {}, () =>
                  notify("全部邀请已撤销，已加入的成员不受影响"),
                )
              }
            >
              撤销全部邀请
            </button>
          </div>
          <p className="form-note">
            {data?.viewer?.role === "owner"
              ? "你是社群群主，可设置管理员并管理社群。"
              : "你是本社群管理员，可发布辩题、邀请成员并管理讨论。"}
          </p>
        </Modal>
      )}
      {modal === "members" && (
        <Modal
          title="把讨论，交给一起在意的人。"
          subtitle="群主可添加或撤销管理员。管理员可以发布辩题、邀请成员并管理讨论。"
          onClose={close}
        >
          {members ? (
            members.map((member) => (
              <div className="member-row" key={member.id}>
                <span className="mini-avatar">
                  {member.nickname.slice(0, 1)}
                </span>
                <div className="member-info">
                  <strong>{member.nickname}</strong>
                  <small>
                    {member.role === "owner"
                      ? "群主"
                      : member.role === "admin"
                        ? "管理员"
                        : "社群成员"}
                  </small>
                </div>
                {member.role === "owner" ? (
                  <span className="owner-badge">群主</span>
                ) : (
                  <button
                    disabled={busy}
                    className="button small outline"
                    onClick={() =>
                      perform(
                        "members/role",
                        {
                          userId: member.id,
                          role: member.role === "admin" ? "member" : "admin",
                        },
                        () =>
                          notify(
                            member.role === "admin"
                              ? "已撤销管理员权限"
                              : "已设为管理员，可发布辩题",
                          ),
                      )
                    }
                  >
                    {member.role === "admin" ? "撤销管理员" : "设为管理员"}
                  </button>
                )}
              </div>
            ))
          ) : (
            <div className="empty">
              <Radio className="spin" />
              <p>正在加载社群成员…</p>
            </div>
          )}
          <p className="form-note">
            <ShieldCheck size={15} />
            管理员权限仅在当前社群生效。群主身份不可通过此页面修改。
          </p>
        </Modal>
      )}
      {modal === "switch" && (
        <Modal
          title="我的社群。"
          subtitle="不同的伙伴，不同的问题，同样认真地思考。"
          onClose={close}
        >
          {communities ? (
            communities.map((c) => (
              <a className="community-option" key={c.id} href={`/c/${c.id}`}>
                <span className="community-logo">辩</span>
                <div>
                  <strong>{c.name}</strong>
                  <small>
                    {c.role === "owner"
                      ? "群主"
                      : c.role === "admin"
                        ? "管理员"
                        : "成员"}
                  </small>
                </div>
                {c.id === communityId ? (
                  <span className="owner-badge">当前社群</span>
                ) : (
                  <ArrowUpRight size={16} />
                )}
              </a>
            ))
          ) : (
            <div className="empty">
              <Radio className="spin" />
              <p>正在加载你的社群…</p>
            </div>
          )}
          <button
            className="button dark full"
            onClick={() => setModal("community")}
          >
            ＋ 创建新社群
          </button>
        </Modal>
      )}
      {modal === "community" && (
        <Modal
          title="为新的伙伴，开一个空间。"
          subtitle="每个社区有独立的辩题、成员、邀请和讨论。"
          onClose={close}
        >
          <form
            onSubmit={(e) =>
              submit(e, "communities/create", (result) =>
                window.location.assign(`/c/${result.slug}`),
              )
            }
          >
            <Field label="社区名称">
              <input name="name" minLength={2} maxLength={40} required />
            </Field>
            <Field label="地址标识（小写字母、数字、短横线）">
              <input
                name="slug"
                pattern="[a-z][a-z0-9-]{1,39}"
                minLength={2}
                maxLength={40}
                required
                placeholder="例如 debate-club"
              />
            </Field>
            <Field label="社区介绍">
              <textarea
                name="description"
                minLength={2}
                maxLength={300}
                required
                rows={3}
              />
            </Field>
            <button className="button dark full" disabled={busy}>
              创建私密社区
              <ArrowRight size={16} />
            </button>
          </form>
        </Modal>
      )}
      {modal === "guide" && (
        <Modal
          title="观点不同，也能一起向前。"
          subtitle="欢迎来到 DebateHub，一个认真思考、自由表达的地方。"
          onClose={close}
        >
          {[
            [
              "01",
              "进入你的社区",
              "扫描管理员的邀请二维码，输入昵称即可加入。公开社区可以直接浏览并加入。",
            ],
            [
              "02",
              "选择持方，给出理由",
              "选择正方或反方，再发表观点。你可以改变持方；历史发言保留发表时的立场。",
            ],
            [
              "03",
              "回应观点，尊重彼此",
              "用论据支持判断，用回复推动讨论。持方比例反映选择，与发言条数无关。",
            ],
          ].map(([n, title, content]) => (
            <div className="guide-step" key={n}>
              <span>{n}</span>
              <div>
                <h3>{title}</h3>
                <p>{content}</p>
              </div>
            </div>
          ))}
          <p className="form-note">
            首版采用昵称参与，一个浏览器对应一个身份。清除 Cookie
            或退出后需重新加入，历史身份暂不支持找回。
          </p>
          <button className="button dark full" onClick={close}>
            明白了，一起思考
            <ArrowRight size={16} />
          </button>
        </Modal>
      )}
      {deleteTarget && (
        <Modal
          title="移除这条观点？"
          subtitle="移除后保留回复关系，正文不可恢复。"
          onClose={() => setDeleteTarget(null)}
        >
          <button
            className="button dark full"
            disabled={busy}
            onClick={() =>
              perform("comments/delete", { commentId: deleteTarget }, () => {
                setDeleteTarget(null);
                notify("观点已移除");
              })
            }
          >
            确认移除
            <Trash2 size={16} />
          </button>
        </Modal>
      )}
    </>
  );
}
